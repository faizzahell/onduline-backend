import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  OCR_QUEUE,
  type OcrJobPayload,
} from '../../../common/queue/queue.constants';
import { StorageService } from '../../../common/storage/storage.service';
import type { ExtractedInvoiceLine } from '../dto/invoice-extraction.dto';
import {
  INVOICE_EXTRACTION_PROVIDER,
  type InvoiceExtractionProvider,
} from '../providers/invoice-extraction.provider';

@Processor(OCR_QUEUE)
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Inject(INVOICE_EXTRACTION_PROVIDER)
    private readonly extractionProvider: InvoiceExtractionProvider,
  ) {
    super();
  }

  async process(job: Job<OcrJobPayload>): Promise<{ ocrJobId: string }> {
    const { ocrJobId, invoiceId, invoiceFileId } = job.data;

    await this.markJobStarted(ocrJobId, invoiceId);

    try {
      const invoiceFile = await this.prisma.invoiceFile.findUnique({
        where: { id: invoiceFileId },
      });

      if (!invoiceFile) {
        throw new Error(`Invoice file ${invoiceFileId} not found`);
      }

      const { invoice: extracted, confidence } =
        await this.extractionProvider.extractFromFile(
          this.storageService.getAbsolutePath(invoiceFile.storageKey),
          invoiceFile.mimeType,
        );

      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'EXTRACTED',
            invoiceNumber: extracted.invoiceNumber ?? null,
            vendorName: extracted.vendorName ?? null,
            invoiceDate: parseIsoDate(extracted.invoiceDate),
            dueDate: parseIsoDate(extracted.dueDate),
            poNumber: extracted.poNumber ?? null,
            currency: extracted.currency ?? 'IDR',
            subtotal: extracted.subtotal ?? null,
            taxAmount: extracted.taxAmount ?? null,
            totalAmount: extracted.totalAmount ?? null,
          },
        });

        await tx.invoiceLine.deleteMany({ where: { invoiceId } });

        if (extracted.lineItems.length > 0) {
          await tx.invoiceLine.createMany({
            data: extracted.lineItems.map((item, index) => ({
              invoiceId,
              lineNumber: index + 1,
              description: item.description ?? null,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
              unitPrice: item.unitPrice ?? null,
              taxAmount: item.taxAmount ?? null,
              lineTotal: resolveLineTotal(item),
            })),
          });
        }

        await tx.oCRResult.create({
          data: {
            ocrJobId,
            rawText: null,
            rawJson: extracted as never,
            confidence,
          },
        });

        await tx.oCRJob.update({
          where: { id: ocrJobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      });

      return { ocrJobId };
    } catch (error) {
      await this.markJobFailed(ocrJobId, invoiceId, error);
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<OcrJobPayload>): void {
    this.logger.log(
      `Job ${job.id} completed for invoice ${job.data.invoiceId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OcrJobPayload> | undefined, error: Error): void {
    this.logger.error(`Job ${job?.id} failed: ${error.message}`, error.stack);
  }

  private async markJobStarted(
    ocrJobId: string,
    invoiceId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.oCRJob.update({
        where: { id: ocrJobId },
        data: {
          status: 'PROCESSING',
          provider: this.extractionProvider.getProviderName(),
          model: this.extractionProvider.getModelName(),
          startedAt: new Date(),
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PROCESSING' },
      }),
    ]);
  }

  private async markJobFailed(
    ocrJobId: string,
    invoiceId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown OCR error';

    await this.prisma.$transaction([
      this.prisma.oCRJob.update({
        where: { id: ocrJobId },
        data: { status: 'FAILED', errorMessage, completedAt: new Date() },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'FAILED' },
      }),
    ]);
  }
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The line total from the provider, or derived from qty x price when absent. */
function resolveLineTotal(item: ExtractedInvoiceLine): number | null {
  if (item.lineTotal !== undefined && item.lineTotal !== null) {
    return item.lineTotal;
  }

  if (item.quantity != null && item.unitPrice != null) {
    return item.quantity * item.unitPrice;
  }

  return null;
}
