import { Injectable } from '@nestjs/common';

import type { PrismaTransactionClient } from '../prisma/prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';

/** Document prefixes used by the system. */
export const DOCUMENT_PREFIX = {
  /** Business Central General Journal, for example GJ26-IS0218. */
  JOURNAL: 'GJ',
  EXPENSE_CLAIM: 'EXP',
  PETTY_CASH: 'PCB',
  CASH_ADVANCE: 'ADV',
} as const;

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Business Central style General Journal number: `GJ26-IS0218`.
   *
   * The initials follow the person who posts it, matching the finance team's
   * convention (IS for Indah Sevia, RE for Resia).
   */
  async nextJournalDocumentNo(
    companyId: string,
    initials: string,
    postingDate: Date,
    client?: PrismaTransactionClient,
  ): Promise<string> {
    const year = postingDate.getFullYear();

    const sequence = await this.increment(
      companyId,
      DOCUMENT_PREFIX.JOURNAL,
      initials,
      year,
      client,
    );

    const shortYear = String(year).slice(-2);
    const running = String(sequence).padStart(4, '0');

    return `${DOCUMENT_PREFIX.JOURNAL}${shortYear}-${initials}${running}`;
  }

  /**
   * Internal document number, for example `EXP/26/000123`. Kept separate from
   * the General Journal number because one document can produce several
   * journals (an accrual and then a reversal).
   */
  async nextDocumentNumber(
    companyId: string,
    prefix: string,
    date: Date,
    client?: PrismaTransactionClient,
  ): Promise<string> {
    const year = date.getFullYear();

    const sequence = await this.increment(companyId, prefix, '-', year, client);

    const shortYear = String(year).slice(-2);
    const running = String(sequence).padStart(6, '0');

    return `${prefix}/${shortYear}/${running}`;
  }

  /**
   * Increments the counter atomically.
   *
   * `upsert` combined with `increment` means two concurrent requests cannot
   * get the same number, because the unique constraint forces one of them to
   * wait.
   */
  private async increment(
    companyId: string,
    prefix: string,
    initials: string,
    year: number,
    client?: PrismaTransactionClient,
  ): Promise<number> {
    const db = client ?? this.prisma;

    const sequence = await db.documentSequence.upsert({
      where: {
        companyId_prefix_initials_year: { companyId, prefix, initials, year },
      },
      update: { lastNumber: { increment: 1 } },
      create: { companyId, prefix, initials, year, lastNumber: 1 },
      select: { lastNumber: true },
    });

    return sequence.lastNumber;
  }
}
