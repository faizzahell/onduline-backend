import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DocumentNumberService } from '../../common/numbering/document-number.service';
import type { PrismaTransactionClient } from '../../common/prisma/prisma-transaction';
import { PrismaService } from '../../common/prisma/prisma.service';

interface JournalLineDraft {
  accountNo: string;
  accountName: string | null;
  description: string;
  /** Positive for a debit, negative for a credit. */
  amount: number;
  areaCode?: string | null;
  employeeCode?: string | null;
  departmentCode?: string | null;
  marketingCode?: string | null;
}

const PETTY_CASH_DESCRIPTION_PREFIX = 'Office PC - ';

/**
 * Builds Business Central General Journal batches from expense documents.
 *
 * The BC integration is not live yet, so batches are stored in the database
 * and can be exported. The line shape already follows the worksheet the
 * finance team uses today, so once the BC API is ready they can simply be
 * sent across without changing how they are built.
 */
@Injectable()
export class BcJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumberService,
  ) {}

  /**
   * The accrual journal raised when a claim is submitted.
   *
   * Every expense line is debited to its category's G/L account, and the whole
   * total is credited to a single accrual account.
   */
  async createExpenseAccrual(
    claimId: string,
    postingDate: Date,
    client?: PrismaTransactionClient,
  ) {
    const db = client ?? this.prisma;
    const claim = await this.loadClaimForJournal(claimId, db);

    const lines: JournalLineDraft[] = claim.entries.map((entry) => ({
      accountNo: this.requireAccount(
        entry.category.glAccountNo,
        entry.category.name,
      ),
      accountName: entry.category.glAccountName,
      description: this.describeEntry(claim.employee.name, entry),
      amount: Number(entry.amount),
      areaCode: entry.employee.areaCode?.code,
      employeeCode: entry.employee.employeeCode,
      departmentCode: entry.employee.department?.code,
      marketingCode: entry.marketingCode?.code,
    }));

    const total = sum(lines);

    lines.push({
      accountNo: claim.company.accruedAccountNo,
      accountName: claim.company.accruedAccountName,
      description: `Accrued expense ${claim.claimNumber} - ${claim.employee.name}`,
      amount: -total,
      areaCode: claim.company.accrualAreaCode,
    });

    return this.persistBatch(
      {
        companyId: claim.companyId,
        type: 'ACCRUAL',
        postingDate,
        initials: claim.company.journalInitials,
        claimId: claim.id,
      },
      lines,
      db,
    );
  }

  /**
   * The journal that reverses the accrual and records the payment at once.
   *
   * It follows the three scenarios in the requirement: the approved amount can
   * equal, exceed, or fall short of what was accrued. The per-line difference
   * goes back to each category's own account, so the amount on the payment
   * voucher is the final amount.
   */
  async createExpenseReversalPayment(
    claimId: string,
    postingDate: Date,
    client?: PrismaTransactionClient,
  ) {
    const db = client ?? this.prisma;
    const claim = await this.loadClaimForJournal(claimId, db);

    if (!claim.company.bankAccountNo) {
      throw new BadRequestException(
        'The company bank account is not set, the payment journal cannot be built',
      );
    }

    const accruedTotal = claim.entries.reduce(
      (total, entry) => total + Number(entry.amount),
      0,
    );

    const approvedTotal = claim.entries.reduce(
      (total, entry) => total + Number(entry.approvedAmount ?? entry.amount),
      0,
    );

    const lines: JournalLineDraft[] = [
      {
        accountNo: claim.company.accruedAccountNo,
        accountName: claim.company.accruedAccountName,
        description: `Reverse accrued ${claim.claimNumber} - ${claim.employee.name}`,
        amount: accruedTotal,
        areaCode: claim.company.accrualAreaCode,
      },
    ];

    for (const entry of claim.entries) {
      const delta =
        Number(entry.approvedAmount ?? entry.amount) - Number(entry.amount);

      if (delta === 0) {
        continue;
      }

      lines.push({
        accountNo: this.requireAccount(
          entry.category.glAccountNo,
          entry.category.name,
        ),
        accountName: entry.category.glAccountName,
        description: `Adjustment ${this.describeEntry(claim.employee.name, entry)}`,
        amount: delta,
        areaCode: entry.employee.areaCode?.code,
        employeeCode: entry.employee.employeeCode,
        departmentCode: entry.employee.department?.code,
        marketingCode: entry.marketingCode?.code,
      });
    }

    lines.push({
      accountNo: claim.company.bankAccountNo,
      accountName: claim.company.bankAccountName,
      description: `Payment ${claim.claimNumber} - ${claim.employee.name}`,
      amount: -approvedTotal,
      areaCode: claim.company.accrualAreaCode,
    });

    return this.persistBatch(
      {
        companyId: claim.companyId,
        type: 'REVERSAL_PAYMENT',
        postingDate,
        initials: claim.company.journalInitials,
        claimId: claim.id,
      },
      lines,
      db,
    );
  }

  /**
   * The petty cash journal: every line is debited to its category account and
   * the total is credited to the cash account.
   */
  async createPettyCashJournal(
    batchId: string,
    postingDate: Date,
    client?: PrismaTransactionClient,
  ) {
    const db = client ?? this.prisma;

    const batch = await db.pettyCashBatch.findUnique({
      where: { id: batchId },
      include: {
        company: true,
        entries: {
          include: { category: true },
          orderBy: { expenseDate: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Petty cash batch not found');
    }

    if (!batch.company.bankAccountNo) {
      throw new BadRequestException(
        'The company cash account is not set, the petty cash journal cannot be built',
      );
    }

    const lines: JournalLineDraft[] = batch.entries.map((entry) => ({
      accountNo: this.requireAccount(
        entry.category.glAccountNo,
        entry.category.name,
      ),
      accountName: entry.category.glAccountName,
      description: `${PETTY_CASH_DESCRIPTION_PREFIX}${entry.description} ${formatShortDate(entry.expenseDate)}`,
      amount: Number(entry.amount),
      areaCode: entry.areaCode,
      employeeCode: entry.employeeCode,
      departmentCode: entry.departmentCode,
    }));

    const total = sum(lines);

    lines.push({
      accountNo: batch.company.bankAccountNo,
      accountName: batch.company.bankAccountName,
      description: `${PETTY_CASH_DESCRIPTION_PREFIX}Replenishment ${batch.batchNumber}`,
      amount: -total,
      areaCode: batch.company.accrualAreaCode,
    });

    return this.persistBatch(
      {
        companyId: batch.companyId,
        type: 'PETTY_CASH',
        postingDate,
        initials: batch.company.pettyCashJournalInitials,
        pettyCashBatchId: batch.id,
      },
      lines,
      db,
    );
  }

  async listBatches(companyId: string, status?: string) {
    return this.prisma.bcJournalBatch.findMany({
      where: { companyId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        claim: { select: { claimNumber: true } },
        pettyCashBatch: { select: { batchNumber: true } },
      },
    });
  }

  async findBatch(companyId: string, id: string) {
    const batch = await this.prisma.bcJournalBatch.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });

    if (!batch) {
      throw new NotFoundException('Journal batch not found');
    }

    return batch;
  }

  /**
   * Journal lines in flat form, ready to export to Excel with the same columns
   * as the General Journal worksheet in use today.
   */
  async exportBatch(companyId: string, id: string) {
    const batch = await this.findBatch(companyId, id);

    return {
      documentNo: batch.documentNo,
      type: batch.type,
      postingDate: batch.postingDate,
      rows: batch.lines.map((line) => ({
        'Posting Date': formatShortDate(batch.postingDate),
        'Document No.': batch.documentNo,
        'Account Type': line.accountType,
        'Account No.': line.accountNo,
        'Account Name': line.accountName,
        Description: line.description,
        'Currency Code': line.currencyCode,
        Amount: Number(line.amount),
        'Area Code': line.areaCode,
        'Employee Code': line.employeeCode,
        'Department Code': line.departmentCode,
        'Marketing Code': line.marketingCode,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Helper
  // -------------------------------------------------------------------------

  private async persistBatch(
    meta: {
      companyId: string;
      type: 'ACCRUAL' | 'REVERSAL_PAYMENT' | 'PETTY_CASH' | 'CASH_ADVANCE';
      postingDate: Date;
      initials: string;
      claimId?: string;
      pettyCashBatchId?: string;
      cashAdvanceId?: string;
    },
    lines: JournalLineDraft[],
    db: PrismaTransactionClient | PrismaService,
  ) {
    if (lines.length === 0) {
      throw new BadRequestException(
        'There are no lines that can be turned into a journal',
      );
    }

    this.assertBalanced(lines);

    const documentNo = await this.documentNumbers.nextJournalDocumentNo(
      meta.companyId,
      meta.initials,
      meta.postingDate,
      db as PrismaTransactionClient,
    );

    return db.bcJournalBatch.create({
      data: {
        companyId: meta.companyId,
        documentNo,
        type: meta.type,
        postingDate: meta.postingDate,
        claimId: meta.claimId,
        pettyCashBatchId: meta.pettyCashBatchId,
        cashAdvanceId: meta.cashAdvanceId,
        lines: {
          create: lines.map((line, index) => ({
            lineNumber: (index + 1) * 10,
            accountNo: line.accountNo,
            accountName: line.accountName,
            description: line.description,
            amount: line.amount,
            areaCode: line.areaCode,
            employeeCode: line.employeeCode,
            departmentCode: line.departmentCode,
            marketingCode: line.marketingCode,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
  }

  /**
   * An unbalanced journal would be rejected by Business Central, so it is
   * better to fail here with a clear message.
   */
  private assertBalanced(lines: JournalLineDraft[]): void {
    const total = Math.round(sum(lines) * 100) / 100;

    if (total !== 0) {
      throw new BadRequestException(
        `The journal is not balanced, difference ${total}. Check the category G/L account mapping.`,
      );
    }
  }

  private requireAccount(
    accountNo: string | null,
    categoryName: string,
  ): string {
    if (!accountNo) {
      throw new BadRequestException(
        `Category "${categoryName}" has no G/L account number yet. Complete the category master data first.`,
      );
    }

    return accountNo;
  }

  private describeEntry(
    employeeName: string,
    entry: {
      category: { name: string };
      destination: string | null;
      description: string | null;
      expenseDate: Date;
    },
  ): string {
    const detail = entry.destination ?? entry.description ?? '';

    return [
      employeeName,
      entry.category.name,
      detail,
      formatShortDate(entry.expenseDate),
    ]
      .filter((part) => String(part).trim().length > 0)
      .join(' ');
  }

  private async loadClaimForJournal(
    claimId: string,
    db: PrismaTransactionClient | PrismaService,
  ) {
    const claim = await db.expenseClaim.findUnique({
      where: { id: claimId },
      include: {
        company: true,
        employee: {
          include: {
            areaCode: { select: { code: true } },
            department: { select: { code: true } },
          },
        },
        entries: {
          include: {
            category: true,
            marketingCode: { select: { code: true } },
            employee: {
              include: {
                areaCode: { select: { code: true } },
                department: { select: { code: true } },
              },
            },
          },
          orderBy: { expenseDate: 'asc' },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.entries.length === 0) {
      throw new BadRequestException('The claim has no expense lines');
    }

    return claim;
  }
}

function sum(lines: JournalLineDraft[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

function formatShortDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
