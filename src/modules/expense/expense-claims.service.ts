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
import type { SubmitClaimDto } from './dto/expense-claim.dto';
import {
  assertClaimNotFinal,
  assertClaimTransition,
  type ClaimStatus,
} from './expense-claim-status';

const claimInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      employeeCode: true,
      position: true,
      department: { select: { code: true, name: true } },
      areaCode: { select: { code: true, name: true } },
      salesArea: { select: { code: true, name: true } },
    },
  },
  entries: {
    orderBy: { expenseDate: 'asc' as const },
    include: {
      category: { select: { id: true, code: true, name: true } },
      marketingCode: { select: { code: true, name: true } },
      attachments: true,
      entertainment: true,
      mealAllowance: true,
      revisions: { orderBy: { revisedAt: 'desc' as const } },
    },
  },
  journalBatches: {
    select: { id: true, documentNo: true, type: true, status: true },
  },
} as const;

@Injectable()
export class ExpenseClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly approval: ApprovalService,
    private readonly journal: BcJournalService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The entries that will be included when a claim is submitted for a period.
   *
   * Selection uses the **entry date**, not the receipt date. The requirement
   * gives the example of a 17 August receipt recorded on 23 August: it still
   * belongs to the September claim, because that is when it was recorded.
   */
  async previewPeriod(
    companyId: string,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const employee = await this.employees.findByUser(companyId, userId);
    const range = toEnteredAtRange(periodStart, periodEnd);

    const entries = await this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        employeeId: employee.id,
        claimId: null,
        // Only verified lines are claimable; drafts still being completed are
        // left out of the claim.
        status: 'VERIFIED',
        enteredAt: range,
      },
      orderBy: [{ expenseDate: 'asc' }, { enteredAt: 'asc' }],
      include: {
        category: { select: { id: true, code: true, name: true } },
        attachments: { select: { id: true, originalName: true } },
      },
    });

    const total = entries.reduce(
      (running, entry) => running + Number(entry.amount),
      0,
    );

    return {
      periodStart,
      periodEnd,
      entryCount: entries.length,
      totalAmount: total,
      byCategory: summarizeByCategory(entries),
      entries,
    };
  }

  /**
   * Creates a claim from the entries in that period that have never been
   * claimed.
   *
   * Linking `claimId` also guards against double claiming: entries that are
   * already linked will not be picked up by a later submission.
   */
  async submit(companyId: string, userId: string, dto: SubmitClaimDto) {
    const employee = await this.employees.findByUser(companyId, userId);
    const claimant = await this.employees.findClaimant(companyId, userId);
    const range = toEnteredAtRange(dto.periodStart, dto.periodEnd);

    const entries = await this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        employeeId: employee.id,
        claimId: null,
        // Drafts are not claimable; only verified lines are swept into a claim.
        status: 'VERIFIED',
        enteredAt: range,
      },
      select: { id: true, amount: true },
    });

    if (entries.length === 0) {
      throw new BadRequestException(
        'There are no verified expense entries that can be claimed for this period. Verify your draft entries first.',
      );
    }

    const total = entries.reduce(
      (running, entry) => running + Number(entry.amount),
      0,
    );

    const claim = await this.prisma.$transaction(async (tx) => {
      const claimNumber = await this.documentNumbers.nextDocumentNumber(
        companyId,
        DOCUMENT_PREFIX.EXPENSE_CLAIM,
        new Date(),
        tx,
      );

      const created = await tx.expenseClaim.create({
        data: {
          companyId,
          claimNumber,
          employeeId: employee.id,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          status: 'SUBMITTED',
          submittedAmount: total,
          submittedAt: new Date(),
        },
      });

      await tx.expenseEntry.updateMany({
        where: { id: { in: entries.map((entry) => entry.id) } },
        data: { claimId: created.id },
      });

      await this.approval.buildSteps(
        {
          companyId,
          document: { documentType: 'EXPENSE_CLAIM', claimId: created.id },
          claimant,
          amount: total,
        },
        tx,
      );

      return created;
    });

    return this.findOne(companyId, claim.id);
  }

  async listMine(companyId: string, userId: string) {
    const employee = await this.employees.findByUser(companyId, userId);

    return this.prisma.expenseClaim.findMany({
      where: { companyId, employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { name: true, employeeCode: true } },
        _count: { select: { entries: true } },
      },
    });
  }

  async listAll(
    companyId: string,
    filters: { status?: string; employeeId?: string; minAmount?: number } = {},
  ) {
    return this.prisma.expenseClaim.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.minAmount
          ? { submittedAmount: { gte: filters.minAmount } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, name: true, employeeCode: true } },
        _count: { select: { entries: true } },
      },
    });
  }

  async findOne(companyId: string, id: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id, companyId },
      include: claimInclude,
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    const steps = await this.approval.listSteps(toRef(id));

    return {
      ...claim,
      approvalSteps: steps,
      byCategory: summarizeByCategory(claim.entries),
    };
  }

  /** Documents waiting for the user to act on, for the approval inbox. */
  async listPendingForUser(companyId: string, userId: string) {
    return this.approval.listPendingStepsForUser(userId, companyId);
  }

  /**
   * Accrue step performed by the finance team: creates the accrual journal and
   * then marks the claim as accrued.
   */
  async accrue(
    companyId: string,
    userId: string,
    claimId: string,
    remark?: string,
  ) {
    const claim = await this.loadForAction(companyId, claimId);

    assertClaimTransition(claim.status as ClaimStatus, 'ACCRUED');

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(claimId),
        userId,
        'ACCRUE',
        remark,
        tx,
      );

      await this.journal.createExpenseAccrual(claimId, new Date(), tx);

      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: 'ACCRUED', accruedAt: new Date() },
      });
    });

    return this.findOne(companyId, claimId);
  }

  /** Review step: marks the claim as checked by the supervisor. */
  async review(
    companyId: string,
    userId: string,
    claimId: string,
    remark?: string,
  ) {
    const claim = await this.loadForAction(companyId, claimId);

    assertClaimNotFinal(claim.status as ClaimStatus);

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(claimId),
        userId,
        'REVIEW',
        remark,
        tx,
      );

      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: 'UNDER_REVIEW' },
      });
    });

    return this.findOne(companyId, claimId);
  }

  /** Approve step. */
  async approve(
    companyId: string,
    userId: string,
    claimId: string,
    remark?: string,
  ) {
    const claim = await this.loadForAction(companyId, claimId);

    assertClaimNotFinal(claim.status as ClaimStatus);

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(claimId),
        userId,
        'APPROVE',
        remark,
        tx,
      );

      const entries = await tx.expenseEntry.findMany({
        where: { claimId },
        select: { amount: true, approvedAmount: true },
      });

      const approvedTotal = entries.reduce(
        (total, entry) => total + Number(entry.approvedAmount ?? entry.amount),
        0,
      );

      await tx.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: 'APPROVED',
          approvedAmount: approvedTotal,
          approvedAt: new Date(),
        },
      });
    });

    return this.findOne(companyId, claimId);
  }

  /**
   * Posting step: creates the journal that reverses the accrual and records
   * the payment, then closes the claim.
   */
  async post(
    companyId: string,
    userId: string,
    claimId: string,
    remark?: string,
  ) {
    const claim = await this.loadForAction(companyId, claimId);

    assertClaimTransition(claim.status as ClaimStatus, 'POSTED');

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(claimId),
        userId,
        'POST',
        remark,
        tx,
      );

      await this.journal.createExpenseReversalPayment(claimId, new Date(), tx);

      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    });

    return this.findOne(companyId, claimId);
  }

  /**
   * Sends the claim back to the claimant for correction.
   *
   * The requirement states that a rejection is a revision rather than an
   * outright refusal, so the entries stay linked to the claim and the claimant
   * can fix them before submitting again.
   */
  async requestRevision(
    companyId: string,
    userId: string,
    claimId: string,
    remark: string,
  ) {
    const claim = await this.loadForAction(companyId, claimId);

    assertClaimTransition(claim.status as ClaimStatus, 'REVISION_REQUESTED');

    await this.prisma.$transaction(async (tx) => {
      await this.approval.requestRevision(toRef(claimId), userId, remark, tx);

      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: 'REVISION_REQUESTED' },
      });
    });

    return this.findOne(companyId, claimId);
  }

  /** Resubmission after a revision; the approval chain is rebuilt from scratch. */
  async resubmit(companyId: string, userId: string, claimId: string) {
    const claim = await this.loadForAction(companyId, claimId);

    if (claim.status !== 'REVISION_REQUESTED') {
      throw new ConflictException(
        'Only claims that have been sent back for revision can be resubmitted',
      );
    }

    const employee = await this.employees.findByUser(companyId, userId);

    if (claim.employeeId !== employee.id) {
      throw new ConflictException('This claim does not belong to you');
    }

    const claimant = await this.employees.findClaimant(companyId, userId);

    const entries = await this.prisma.expenseEntry.findMany({
      where: { claimId },
      select: { amount: true },
    });

    const total = entries.reduce(
      (running, entry) => running + Number(entry.amount),
      0,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: 'SUBMITTED',
          submittedAmount: total,
          submittedAt: new Date(),
        },
      });

      await this.approval.buildSteps(
        {
          companyId,
          document: toRef(claimId),
          claimant,
          amount: total,
        },
        tx,
      );
    });

    return this.findOne(companyId, claimId);
  }

  private async loadForAction(companyId: string, claimId: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id: claimId, companyId },
      select: { id: true, status: true, employeeId: true },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    return claim;
  }

  /**
   * Hard-deletes a claim together with the whole expense footprint of the
   * employee who submitted it, within the active company.
   *
   * This is an administrator-only escape hatch, not part of the normal flow:
   * it removes the claim, every expense entry that employee recorded (claimed
   * or not, with their attachments, entertainment/meal detail and revisions by
   * cascade), the expense OCR jobs they uploaded, and the BC journal batches
   * tied to any of their claims. Approval steps cascade from the claims.
   *
   * @returns the counts removed and the submitter, for the confirmation message.
   */
  async deleteClaimAndSubmitterData(companyId: string, claimId: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id: claimId, companyId },
      select: {
        id: true,
        employeeId: true,
        employee: { select: { name: true, employeeCode: true } },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    const employeeId = claim.employeeId;

    // Collect the stored files before the rows go, so they can be removed from
    // disk afterwards.
    const [entries, ocrJobs] = await Promise.all([
      this.prisma.expenseEntry.findMany({
        where: { companyId, employeeId },
        select: { attachments: { select: { storageKey: true } } },
      }),
      this.prisma.expenseOcrJob.findMany({
        where: {
          companyId,
          expenseEntry: { employeeId },
        },
        select: { storageKey: true },
      }),
    ]);

    const storageKeys = [
      ...entries.flatMap((entry) =>
        entry.attachments.map((attachment) => attachment.storageKey),
      ),
      ...ocrJobs.map((job) => job.storageKey),
    ];

    const counts = await this.prisma.$transaction(async (tx) => {
      const claimIds = (
        await tx.expenseClaim.findMany({
          where: { companyId, employeeId },
          select: { id: true },
        })
      ).map((row) => row.id);

      // Journal batches reference claims with SetNull, so remove them first to
      // avoid leaving orphaned journals behind.
      const journalBatches = await tx.bcJournalBatch.deleteMany({
        where: { claimId: { in: claimIds } },
      });

      // OCR jobs reference entries with SetNull; delete the submitter's jobs
      // explicitly so none are left dangling.
      const deletedOcrJobs = await tx.expenseOcrJob.deleteMany({
        where: { companyId, expenseEntry: { employeeId } },
      });

      // Entries cascade attachments, entertainment, meal, and revisions.
      const deletedEntries = await tx.expenseEntry.deleteMany({
        where: { companyId, employeeId },
      });

      // Claims cascade their approval steps.
      const deletedClaims = await tx.expenseClaim.deleteMany({
        where: { companyId, employeeId },
      });

      return {
        journalBatches: journalBatches.count,
        ocrJobs: deletedOcrJobs.count,
        entries: deletedEntries.count,
        claims: deletedClaims.count,
      };
    });

    for (const key of storageKeys) {
      try {
        await this.storage.deleteFile(key);
      } catch {
        // A missing or unreadable file must not fail the deletion.
      }
    }

    return {
      message: `Deleted the expense data of ${claim.employee.name} (${claim.employee.employeeCode})`,
      submitter: claim.employee,
      deleted: counts,
    };
  }
}

function toRef(claimId: string): ApprovalDocumentRef {
  return { documentType: 'EXPENSE_CLAIM', claimId };
}

/**
 * An `enteredAt` range that covers the whole day at both ends of the period,
 * because the column stores a timestamp while the period is expressed as dates.
 */
function toEnteredAtRange(from: string, to: string) {
  const start = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${to.slice(0, 10)}T23:59:59.999Z`);

  if (end < start) {
    throw new BadRequestException(
      'The period end cannot be earlier than the period start',
    );
  }

  return { gte: start, lte: end };
}

/** Per-category summary for the approval screen. */
function summarizeByCategory(
  entries: {
    amount: unknown;
    approvedAmount?: unknown;
    category: { id: string; code: string; name: string };
  }[],
) {
  const groups = new Map<
    string,
    {
      categoryId: string;
      code: string;
      name: string;
      amount: number;
      count: number;
    }
  >();

  for (const entry of entries) {
    const key = entry.category.id;

    const current = groups.get(key) ?? {
      categoryId: entry.category.id,
      code: entry.category.code,
      name: entry.category.name,
      amount: 0,
      count: 0,
    };

    current.amount += Number(entry.approvedAmount ?? entry.amount);
    current.count += 1;

    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}
