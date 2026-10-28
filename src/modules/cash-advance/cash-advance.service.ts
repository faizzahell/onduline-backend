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
import { ApprovalService } from '../approval/approval.service';
import type { ApprovalDocumentRef } from '../approval/approval.types';
import { EmployeesService } from '../expense-master/employees.service';
import type {
  CreateCashAdvanceDto,
  SettleCashAdvanceDto,
} from './dto/cash-advance.dto';

type AdvanceStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'POSTED'
  | 'SETTLED'
  | 'CANCELLED';

const advanceInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      employeeCode: true,
      level: true,
      department: { select: { code: true, name: true } },
    },
  },
} as const;

@Injectable()
export class CashAdvanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly employees: EmployeesService,
    private readonly documentNumbers: DocumentNumberService,
  ) {}

  async list(
    companyId: string,
    filters: { status?: string; type?: string } = {},
  ) {
    return this.prisma.cashAdvance.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.type ? { type: filters.type as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: advanceInclude,
    });
  }

  async findOne(companyId: string, id: string) {
    const advance = await this.prisma.cashAdvance.findFirst({
      where: { id, companyId },
      include: advanceInclude,
    });

    if (!advance) {
      throw new NotFoundException('Cash advance not found');
    }

    const steps = await this.approval.listSteps(toRef(id));

    return { ...advance, approvalSteps: steps };
  }

  async create(companyId: string, userId: string, dto: CreateCashAdvanceDto) {
    await this.employees.findOne(companyId, dto.employeeId);

    if (dto.type === 'YEARLY') {
      if (!dto.periodYear) {
        throw new BadRequestException(
          'A yearly advance requires the year it applies to',
        );
      }

      const existing = await this.prisma.cashAdvance.findFirst({
        where: {
          companyId,
          employeeId: dto.employeeId,
          type: 'YEARLY',
          periodYear: dto.periodYear,
          status: { notIn: ['CANCELLED'] },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          'This employee already has a yearly advance for that year',
        );
      }
    }

    const advance = await this.prisma.$transaction(async (tx) => {
      const advanceNumber = await this.documentNumbers.nextDocumentNumber(
        companyId,
        DOCUMENT_PREFIX.CASH_ADVANCE,
        new Date(),
        tx,
      );

      return tx.cashAdvance.create({
        data: {
          companyId,
          advanceNumber,
          type: dto.type,
          employeeId: dto.employeeId,
          amount: dto.amount,
          periodYear: dto.periodYear,
          purpose: dto.purpose,
          requestedByUserId: userId,
        },
      });
    });

    return this.findOne(companyId, advance.id);
  }

  /**
   * Submit for approval.
   *
   * Approval rules are matched against the profile of the advance
   * **recipient**, not the requester, because HR raises yearly advances on
   * behalf of other employees while the approval path is driven by the
   * recipient's level.
   */
  async submit(companyId: string, id: string) {
    const advance = await this.loadForAction(companyId, id);

    if (!['DRAFT', 'REVISION_REQUESTED'].includes(advance.status)) {
      throw new ConflictException(
        `An advance with status ${advance.status} cannot be submitted`,
      );
    }

    const employee = await this.employees.findOne(
      companyId,
      advance.employeeId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.cashAdvance.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });

      await this.approval.buildSteps(
        {
          companyId,
          document: toRef(id),
          claimant: {
            employeeId: employee.id,
            level: employee.level as 'STAFF' | 'MANAGER' | 'DIRECTOR',
            division: employee.division as 'SALES' | 'NON_SALES',
            departmentId: employee.departmentId,
            salesAreaId: employee.salesAreaId,
          },
          amount: Number(advance.amount),
        },
        tx,
      );
    });

    return this.findOne(companyId, id);
  }

  async review(companyId: string, userId: string, id: string, remark?: string) {
    await this.advanceStep(
      companyId,
      userId,
      id,
      'REVIEW',
      'UNDER_REVIEW',
      remark,
    );

    return this.findOne(companyId, id);
  }

  async approve(
    companyId: string,
    userId: string,
    id: string,
    remark?: string,
  ) {
    await this.advanceStep(
      companyId,
      userId,
      id,
      'APPROVE',
      'APPROVED',
      remark,
    );

    return this.findOne(companyId, id);
  }

  async post(companyId: string, userId: string, id: string, remark?: string) {
    const advance = await this.loadForAction(companyId, id);

    if (advance.status !== 'APPROVED') {
      throw new ConflictException('Only an approved advance can be posted');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(id),
        userId,
        'POST',
        remark,
        tx,
      );

      await tx.cashAdvance.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date() },
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
    await this.prisma.$transaction(async (tx) => {
      await this.approval.requestRevision(toRef(id), userId, remark, tx);

      await tx.cashAdvance.update({
        where: { id },
        data: { status: 'REVISION_REQUESTED' },
      });
    });

    return this.findOne(companyId, id);
  }

  /**
   * Year-end settlement of a yearly advance.
   *
   * Requirement: if the realised spend exceeds the advance, the company pays
   * the difference; if it falls short, the employee returns the difference.
   */
  async settle(companyId: string, id: string, dto: SettleCashAdvanceDto) {
    const advance = await this.loadForAction(companyId, id);

    if (advance.status !== 'POSTED') {
      throw new ConflictException('Only a posted advance can be settled');
    }

    if (advance.type !== 'YEARLY') {
      throw new ConflictException(
        'Year-end settlement only applies to a yearly advance',
      );
    }

    await this.prisma.cashAdvance.update({
      where: { id },
      data: {
        status: 'SETTLED',
        settlementAmount: dto.settlementAmount,
        settledAt: new Date(),
        purpose: dto.remark ?? advance.purpose,
      },
    });

    return this.findOne(companyId, id);
  }

  /**
   * Suggested settlement amount: the employee's realised expenses for that
   * year minus the total advance already handed out.
   */
  async calculateSettlement(companyId: string, id: string) {
    const advance = await this.prisma.cashAdvance.findFirst({
      where: { id, companyId },
      select: { employeeId: true, amount: true, periodYear: true, type: true },
    });

    if (!advance) {
      throw new NotFoundException('Cash advance not found');
    }

    if (advance.type !== 'YEARLY' || !advance.periodYear) {
      throw new BadRequestException(
        'The calculation only applies to a yearly advance',
      );
    }

    const start = new Date(Date.UTC(advance.periodYear, 0, 1));
    const end = new Date(Date.UTC(advance.periodYear, 11, 31, 23, 59, 59, 999));

    const realised = await this.prisma.expenseEntry.aggregate({
      where: {
        companyId,
        employeeId: advance.employeeId,
        expenseDate: { gte: start, lte: end },
        claim: { status: { in: ['APPROVED', 'POSTED'] } },
      },
      _sum: { amount: true, approvedAmount: true },
    });

    const realisedTotal = Number(
      realised._sum.approvedAmount ?? realised._sum.amount ?? 0,
    );

    // A yearly advance is set as a monthly figure and topped up every month.
    const advanceTotal = Number(advance.amount) * 12;

    return {
      periodYear: advance.periodYear,
      monthlyAdvance: Number(advance.amount),
      advanceTotal,
      realisedTotal,
      suggestedSettlementAmount: realisedTotal - advanceTotal,
    };
  }

  private async advanceStep(
    companyId: string,
    userId: string,
    id: string,
    stepType: 'REVIEW' | 'APPROVE',
    nextStatus: AdvanceStatus,
    remark?: string,
  ): Promise<void> {
    const advance = await this.loadForAction(companyId, id);

    if (['POSTED', 'SETTLED', 'CANCELLED'].includes(advance.status)) {
      throw new ConflictException(
        `An advance with status ${advance.status} cannot be processed any further`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.approval.approveCurrentStep(
        toRef(id),
        userId,
        stepType,
        remark,
        tx,
      );

      await tx.cashAdvance.update({
        where: { id },
        data: { status: nextStatus },
      });
    });
  }

  private async loadForAction(companyId: string, id: string) {
    const advance = await this.prisma.cashAdvance.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        type: true,
        amount: true,
        employeeId: true,
        purpose: true,
      },
    });

    if (!advance) {
      throw new NotFoundException('Cash advance not found');
    }

    return advance;
  }
}

function toRef(cashAdvanceId: string): ApprovalDocumentRef {
  return { documentType: 'CASH_ADVANCE', cashAdvanceId };
}
