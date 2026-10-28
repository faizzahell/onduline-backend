import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  DOCUMENT_PREFIX,
  DocumentNumberService,
} from '../../common/numbering/document-number.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ApprovalService } from '../approval/approval.service';
import type { ApprovalDocumentRef } from '../approval/approval.types';
import { BcJournalService } from '../business-central/bc-journal.service';
import { EmployeesService } from '../expense-master/employees.service';
import type {
  CreatePettyCashBatchDto,
  PettyCashEntryDto,
  UpdatePettyCashBatchDto,
} from './dto/petty-cash.dto';

type BatchStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'POSTED'
  | 'CANCELLED';

const EDITABLE_STATUSES: readonly BatchStatus[] = [
  'DRAFT',
  'REVISION_REQUESTED',
];

const batchInclude = {
  entries: {
    orderBy: { expenseDate: 'asc' as const },
    include: {
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          glAccountNo: true,
          pettyCashCode: true,
        },
      },
      attachments: true,
    },
  },
  journalBatches: {
    select: { id: true, documentNo: true, type: true, status: true },
  },
} as const;

@Injectable()
export class PettyCashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly approval: ApprovalService,
    private readonly journal: BcJournalService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly employees: EmployeesService,
  ) {}

  async list(companyId: string, status?: string) {
    return this.prisma.pettyCashBatch.findMany({
      where: { companyId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { entries: true } } },
    });
  }

  async findOne(companyId: string, id: string) {
    const batch = await this.prisma.pettyCashBatch.findFirst({
      where: { id, companyId },
      include: batchInclude,
    });

    if (!batch) {
      throw new NotFoundException('Petty cash batch not found');
    }

    const steps = await this.approval.listSteps(toRef(id));

    return { ...batch, approvalSteps: steps };
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreatePettyCashBatchDto,
  ) {
    await this.assertCategories(companyId, dto.entries);

    const total = sumEntries(dto.entries);

    const batch = await this.prisma.$transaction(async (tx) => {
      const batchNumber = await this.documentNumbers.nextDocumentNumber(
        companyId,
        DOCUMENT_PREFIX.PETTY_CASH,
        new Date(),
        tx,
      );

      return tx.pettyCashBatch.create({
        data: {
          companyId,
          batchNumber,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          totalAmount: total,
          createdByUserId: userId,
          entries: { create: dto.entries.map(toEntryData) },
        },
      });
    });

    return this.findOne(companyId, batch.id);
  }

  /** Replaces the batch contents while it is still unsubmitted or under revision. */
  async update(companyId: string, id: string, dto: UpdatePettyCashBatchDto) {
    const batch = await this.loadForAction(companyId, id);

    this.assertEditable(batch.status as BatchStatus);

    if (dto.entries) {
      await this.assertCategories(companyId, dto.entries);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.entries) {
        await tx.pettyCashEntry.deleteMany({ where: { batchId: id } });

        await tx.pettyCashEntry.createMany({
          data: dto.entries.map((entry) => ({
            batchId: id,
            ...toEntryData(entry),
          })),
        });
      }

      await tx.pettyCashBatch.update({
        where: { id },
        data: {
          ...(dto.periodStart
            ? { periodStart: new Date(dto.periodStart) }
            : {}),
          ...(dto.periodEnd ? { periodEnd: new Date(dto.periodEnd) } : {}),
          ...(dto.entries ? { totalAmount: sumEntries(dto.entries) } : {}),
        },
      });
    });

    return this.findOne(companyId, id);
  }

  /** Per-line attachments, so an audit can pull the evidence for a single sampled row. */
  async addEntryAttachments(
    companyId: string,
    batchId: string,
    entryId: string,
    files: Express.Multer.File[],
  ) {
    if (files.length === 0) {
      throw new BadRequestException('No files were uploaded');
    }

    const batch = await this.loadForAction(companyId, batchId);

    this.assertEditable(batch.status as BatchStatus);

    const entry = await this.prisma.pettyCashEntry.findFirst({
      where: { id: entryId, batchId },
      select: { id: true },
    });

    if (!entry) {
      throw new NotFoundException('Petty cash line not found');
    }

    for (const file of files) {
      const stored = await this.storage.saveFile(`petty-cash/${batchId}`, file);

      await this.prisma.pettyCashAttachment.create({
        data: {
          entryId,
          originalName: file.originalname,
          storageKey: stored.storageKey,
          mimeType: file.mimetype,
          size: file.size,
        },
      });
    }

    return this.findOne(companyId, batchId);
  }

  async submit(companyId: string, userId: string, id: string) {
    const batch = await this.loadForAction(companyId, id);

    this.assertEditable(batch.status as BatchStatus);

    const entryCount = await this.prisma.pettyCashEntry.count({
      where: { batchId: id },
    });

    if (entryCount === 0) {
      throw new BadRequestException('The batch has no expense lines');
    }

    const claimant = await this.employees.findClaimant(companyId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.pettyCashBatch.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });

      await this.approval.buildSteps(
        {
          companyId,
          document: toRef(id),
          claimant,
          amount: Number(batch.totalAmount),
        },
        tx,
      );
    });

    return this.findOne(companyId, id);
  }

  async approve(
    companyId: string,
    userId: string,
    id: string,
    remark?: string,
  ) {
    const batch = await this.loadForAction(companyId, id);

    if (batch.status !== 'SUBMITTED') {
      throw new ConflictException(
        `A batch with status ${batch.status} cannot be approved`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(id),
        userId,
        'APPROVE',
        remark,
        tx,
      );

      await tx.pettyCashBatch.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
    });

    return this.findOne(companyId, id);
  }

  async requestRevision(
    companyId: string,
    userId: string,
    id: string,
    remark: string,
  ) {
    const batch = await this.loadForAction(companyId, id);

    if (batch.status !== 'SUBMITTED') {
      throw new ConflictException(
        `A batch with status ${batch.status} cannot be sent back for revision`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.approval.requestRevision(toRef(id), userId, remark, tx);

      await tx.pettyCashBatch.update({
        where: { id },
        data: { status: 'REVISION_REQUESTED' },
      });
    });

    return this.findOne(companyId, id);
  }

  /** Builds the petty cash journal and closes the batch. */
  async post(companyId: string, userId: string, id: string, remark?: string) {
    const batch = await this.loadForAction(companyId, id);

    if (batch.status !== 'APPROVED') {
      throw new ConflictException('Only an approved batch can be posted');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(id),
        userId,
        'POST',
        remark,
        tx,
      );

      await this.journal.createPettyCashJournal(id, new Date(), tx);

      await tx.pettyCashBatch.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    });

    return this.findOne(companyId, id);
  }

  private assertEditable(status: BatchStatus): void {
    if (!EDITABLE_STATUSES.includes(status)) {
      throw new ConflictException(
        `A batch with status ${status} cannot be edited`,
      );
    }
  }

  private async loadForAction(companyId: string, id: string) {
    const batch = await this.prisma.pettyCashBatch.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, totalAmount: true },
    });

    if (!batch) {
      throw new NotFoundException('Petty cash batch not found');
    }

    return batch;
  }

  /**
   * Makes sure every category exists, is active, and is actually offered for
   * petty cash. The G/L account number is checked too, so the journal cannot
   * fail to build later on at posting time.
   */
  private async assertCategories(
    companyId: string,
    entries: PettyCashEntryDto[],
  ): Promise<void> {
    const ids = [...new Set(entries.map((entry) => entry.categoryId))];

    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: ids }, companyId, isActive: true },
      select: {
        id: true,
        name: true,
        glAccountNo: true,
        availableForPettyCash: true,
      },
    });

    if (categories.length !== ids.length) {
      throw new NotFoundException(
        'Some categories were not found or are inactive',
      );
    }

    for (const category of categories) {
      if (!category.availableForPettyCash) {
        throw new BadRequestException(
          `Category "${category.name}" is not available for petty cash`,
        );
      }

      if (!category.glAccountNo) {
        throw new BadRequestException(
          `Category "${category.name}" has no G/L account number yet`,
        );
      }
    }
  }
}

function toRef(pettyCashBatchId: string): ApprovalDocumentRef {
  return { documentType: 'PETTY_CASH_BATCH', pettyCashBatchId };
}

function toEntryData(entry: PettyCashEntryDto) {
  return {
    expenseDate: new Date(entry.expenseDate),
    categoryId: entry.categoryId,
    description: entry.description,
    amount: entry.amount,
    areaCode: entry.areaCode,
    employeeCode: entry.employeeCode,
    departmentCode: entry.departmentCode,
  };
}

function sumEntries(entries: PettyCashEntryDto[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}
