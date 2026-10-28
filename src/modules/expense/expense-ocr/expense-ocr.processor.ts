import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  EXPENSE_OCR_QUEUE,
  type ExpenseOcrJobPayload,
} from '../../../common/queue/queue.constants';
import { StorageService } from '../../../common/storage/storage.service';
import { ExpenseOcrProvider } from './expense-ocr.provider';

@Processor(EXPENSE_OCR_QUEUE)
export class ExpenseOcrProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpenseOcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly provider: ExpenseOcrProvider,
  ) {
    super();
  }

  async process(job: Job<ExpenseOcrJobPayload>): Promise<{ jobId: string }> {
    const { expenseOcrJobId } = job.data;

    const ocrJob = await this.prisma.expenseOcrJob.findUnique({
      where: { id: expenseOcrJobId },
    });

    if (!ocrJob) {
      throw new Error(`Expense OCR job ${expenseOcrJobId} not found`);
    }

    await this.prisma.expenseOcrJob.update({
      where: { id: expenseOcrJobId },
      data: {
        status: 'PROCESSING',
        provider: this.provider.getProviderName(),
        model: this.provider.getModelName(),
        startedAt: new Date(),
      },
    });

    try {
      // The choices come from the company's own master data, so the engine
      // covers every category without a hardcoded list.
      const categories = await this.prisma.expenseCategory.findMany({
        where: {
          companyId: ocrJob.companyId,
          isActive: true,
          availableForExpense: true,
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });

      const extracted = await this.provider.extractFromFile(
        this.storage.getAbsolutePath(ocrJob.storageKey),
        ocrJob.mimeType,
        categories.map(({ code, name }) => ({ code, name })),
      );

      const matched = extracted.categoryCode
        ? categories.find(
            (category) => category.code === extracted.categoryCode,
          )
        : undefined;

      await this.prisma.expenseOcrJob.update({
        where: { id: expenseOcrJobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          rawJson: extracted as never,
          suggestedCategoryId: matched?.id ?? null,
          suggestedCategoryRaw: extracted.categoryCode,
          suggestedDate: parseIsoDate(extracted.transactionDate),
          suggestedAmount: extracted.totalAmount,
          suggestedTaxAmount: extracted.taxAmount,
          suggestedMerchant: extracted.merchantName,
          suggestedDescription: extracted.description,
        },
      });

      return { jobId: expenseOcrJobId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown extraction error';

      // A failed extraction must not block the employee: the entry form stays
      // usable, so the job is simply marked as failed.
      await this.prisma.expenseOcrJob.update({
        where: { id: expenseOcrJobId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExpenseOcrJobPayload> | undefined, error: Error): void {
    this.logger.warn(
      `Receipt extraction ${job?.data.expenseOcrJobId} failed: ${error.message}`,
    );
  }
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
