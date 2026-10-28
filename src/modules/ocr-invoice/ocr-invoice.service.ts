import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  OCR_PROCESS_INVOICE_JOB,
  OCR_QUEUE,
  type OcrJobPayload,
} from '../../common/queue/queue.constants';
import { StorageService } from '../../common/storage/storage.service';
import type { CompanyContext } from '../../common/types/company-context';
import { BusinessCentralService } from '../business-central/business-central.service';
import type { OpenPurchaseOrder } from '../business-central/business-central.types';
import type { BindPoDto } from './dto/bind-po.dto';
import type {
  CreateInvoiceDto,
  CreateManualInvoiceDto,
} from './dto/create-invoice.dto';
import type {
  UpdateInvoiceDto,
  ValidateInvoiceDto,
} from './dto/update-invoice.dto';
import {
  assertAcceptsNewFile,
  assertEditable,
  assertTransitionAllowed,
  type InvoiceStatus,
} from './invoice-status';
import { calculateMatchScorePercent } from './po-matching';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export type PurchaseOrderCandidate = OpenPurchaseOrder & {
  matchScorePercent: number;
};

@Injectable()
export class OcrInvoiceService {
  private readonly logger = new Logger(OcrInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly businessCentral: BusinessCentralService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue<OcrJobPayload>,
  ) {}

  /** An empty invoice container, filled in through file uploads. */
  async create(companyId: string, userId: string, dto: CreateInvoiceDto) {
    return this.prisma.invoice.create({
      data: {
        companyId,
        source: 'MANUAL',
        invoiceNumber: dto.invoiceNumber,
        vendorName: dto.vendorName,
        vendorTaxId: dto.vendorTaxId,
        currency: dto.currency ?? 'IDR',
        createdById: userId,
      },
    });
  }

  /**
   * Manual data entry without OCR.
   *
   * Because the data is already complete from the start, the invoice goes
   * straight to `EXTRACTED` status and continues through the same review,
   * matching, and submit flow as an OCR-extracted invoice.
   */
  async createManual(
    companyId: string,
    userId: string,
    dto: CreateManualInvoiceDto,
  ) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          companyId,
          source: 'MANUAL',
          status: 'EXTRACTED',
          invoiceNumber: dto.invoiceNumber,
          vendorName: dto.vendorName,
          vendorTaxId: dto.vendorTaxId,
          poNumber: dto.poNumber,
          currency: dto.currency ?? 'IDR',
          subtotal: dto.subtotal,
          taxAmount: dto.taxAmount,
          totalAmount: dto.totalAmount,
          createdById: userId,
          ...(dto.invoiceDate
            ? { invoiceDate: new Date(dto.invoiceDate) }
            : {}),
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        },
      });

      if (dto.lines && dto.lines.length > 0) {
        await tx.invoiceLine.createMany({
          data: dto.lines.map((line, index) => ({
            invoiceId: created.id,
            lineNumber: index + 1,
            description: line.description ?? null,
            quantity: line.quantity ?? null,
            unit: line.unit ?? null,
            unitPrice: line.unitPrice ?? null,
            taxAmount: line.taxAmount ?? null,
            lineTotal: line.lineTotal ?? null,
          })),
        });
      }

      return created;
    });

    return this.findOne(companyId, invoice.id);
  }

  async findAll(companyId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        files: true,
        ocrJobs: { orderBy: { createdAt: 'desc' }, take: 1 },
        lines: { orderBy: { lineNumber: 'asc' } },
      },
    });
  }

  async findOne(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        files: true,
        ocrJobs: { include: { result: true }, orderBy: { createdAt: 'desc' } },
        lines: { orderBy: { lineNumber: 'asc' } },
        validatedBy: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Stores the invoice file, and only queues extraction when it is requested
   * and OCR is actually enabled for this company.
   *
   * Without OCR the file is still stored as an attachment, and its data is
   * filled in manually through the review page.
   */
  async uploadFile(
    company: CompanyContext,
    invoiceId: string,
    file: Express.Multer.File,
    runOcr: boolean,
  ) {
    const invoice = await this.getInvoiceOrFail(company.id, invoiceId);

    assertAcceptsNewFile(invoice.status as InvoiceStatus);

    if (runOcr && !company.ocrInvoiceEnabled) {
      throw new ForbiddenException(
        `OCR is not enabled for company ${company.code}. Contact a super administrator or record the invoice manually.`,
      );
    }

    const stored = await this.storageService.saveInvoiceFile(invoiceId, file);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const invoiceFile = await tx.invoiceFile.create({
          data: {
            invoiceId,
            originalName: file.originalname,
            storageKey: stored.storageKey,
            mimeType: file.mimetype,
            size: file.size,
          },
        });

        if (!runOcr) {
          return { invoiceFile, ocrJob: null };
        }

        const ocrJob = await tx.oCRJob.create({
          data: { invoiceId, status: 'PENDING' },
        });

        await tx.invoice.update({
          where: { id: invoiceId },
          data: { source: 'OCR' },
        });

        return { invoiceFile, ocrJob };
      });

      if (result.ocrJob) {
        await this.ocrQueue.add(
          OCR_PROCESS_INVOICE_JOB,
          {
            ocrJobId: result.ocrJob.id,
            invoiceId,
            invoiceFileId: result.invoiceFile.id,
          },
          JOB_OPTIONS,
        );
      }

      return result;
    } catch (error) {
      // The file is already on disk but its record failed to be created, so
      // clean it up to avoid leaving behind an orphaned file.
      await this.storageService.deleteFile(stored.storageKey);
      throw error;
    }
  }

  async getOCRJobs(companyId: string, invoiceId: string) {
    await this.getInvoiceOrFail(companyId, invoiceId);

    return this.prisma.oCRJob.findMany({
      where: { invoiceId },
      include: { result: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** File metadata and stream, used by the guard-protected download endpoint. */
  async getFileForDownload(
    companyId: string,
    invoiceId: string,
    fileId: string,
  ) {
    const file = await this.prisma.invoiceFile.findFirst({
      where: { id: fileId, invoiceId, invoice: { companyId } },
    });

    if (!file) {
      throw new NotFoundException('Invoice file not found');
    }

    if (!(await this.storageService.exists(file.storageKey))) {
      throw new NotFoundException(
        'Invoice file is no longer available in storage',
      );
    }

    return {
      file,
      stream: this.storageService.createReadStream(file.storageKey),
    };
  }

  /**
   * Updates an invoice. Only the fields that are sent change; `lines` is
   * replaced in full only when it is included.
   */
  async update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.getInvoiceOrFail(companyId, id);

    assertEditable(invoice.status as InvoiceStatus);

    // A manual invoice that only holds a file moves up to EXTRACTED as soon
    // as its data is filled in, so it enters the same review flow as an
    // OCR-extracted invoice.
    const promoteStatus =
      invoice.source === 'MANUAL' && invoice.status === 'UPLOADED';

    return this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: dto.invoiceNumber,
          vendorName: dto.vendorName,
          vendorTaxId: dto.vendorTaxId,
          poNumber: dto.poNumber,
          currency: dto.currency,
          subtotal: dto.subtotal,
          taxAmount: dto.taxAmount,
          totalAmount: dto.totalAmount,
          ...(promoteStatus ? { status: 'EXTRACTED' as const } : {}),
          ...(dto.invoiceDate !== undefined && {
            invoiceDate: new Date(dto.invoiceDate),
          }),
          ...(dto.dueDate !== undefined && {
            dueDate: new Date(dto.dueDate),
          }),
        },
      });

      if (dto.lines !== undefined) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

        if (dto.lines.length > 0) {
          await tx.invoiceLine.createMany({
            data: dto.lines.map((line, index) => ({
              invoiceId: id,
              lineNumber: index + 1,
              description: line.description ?? null,
              quantity: line.quantity ?? null,
              unit: line.unit ?? null,
              unitPrice: line.unitPrice ?? null,
              taxAmount: line.taxAmount ?? null,
              lineTotal: line.lineTotal ?? null,
            })),
          });
        }
      }

      return tx.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          files: true,
          lines: { orderBy: { lineNumber: 'asc' } },
          validatedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  async validateInvoice(
    companyId: string,
    id: string,
    userId: string,
    dto: ValidateInvoiceDto,
  ) {
    const invoice = await this.getInvoiceOrFail(companyId, id);

    assertTransitionAllowed(invoice.status as InvoiceStatus, dto.status);

    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: dto.status,
        validatedById: userId,
        validatedAt: new Date(),
      },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        validatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** Open purchase orders for the invoice vendor, sorted by best match first. */
  async findPurchaseOrderCandidates(
    companyId: string,
    id: string,
  ): Promise<{ mocked: boolean; candidates: PurchaseOrderCandidate[] }> {
    const invoice = await this.getInvoiceOrFail(companyId, id);

    const purchaseOrders = await this.businessCentral.findOpenPurchaseOrders(
      invoice.vendorName,
    );

    const invoiceTotal =
      invoice.totalAmount === null ? null : Number(invoice.totalAmount);

    const candidates = purchaseOrders
      .map((purchaseOrder) => ({
        ...purchaseOrder,
        matchScorePercent: calculateMatchScorePercent({
          invoiceTotal,
          invoiceVendorName: invoice.vendorName,
          poTotal: purchaseOrder.totalAmount,
          poVendorName: purchaseOrder.vendorName,
        }),
      }))
      .sort((a, b) => b.matchScorePercent - a.matchScorePercent);

    return { mocked: this.businessCentral.isMocked, candidates };
  }

  /** Links an invoice to a Business Central purchase order. */
  async bindPurchaseOrder(companyId: string, id: string, dto: BindPoDto) {
    const invoice = await this.getInvoiceOrFail(companyId, id);

    assertEditable(invoice.status as InvoiceStatus);

    return this.prisma.invoice.update({
      where: { id },
      data: { poNumber: dto.poNumber },
      include: {
        files: true,
        lines: { orderBy: { lineNumber: 'asc' } },
        validatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async submitToBusinessCentral(companyId: string, id: string) {
    const invoice = await this.getInvoiceOrFail(companyId, id);

    assertTransitionAllowed(invoice.status as InvoiceStatus, 'SUBMITTED');

    const { bcInvoiceNo } = await this.businessCentral.submitPurchaseInvoice({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      poNumber: invoice.poNumber,
      currency: invoice.currency,
      totalAmount:
        invoice.totalAmount === null ? null : Number(invoice.totalAmount),
    });

    await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    return {
      message: 'Invoice submitted to Business Central successfully',
      bcInvoiceNo,
      mocked: this.businessCentral.isMocked,
    };
  }

  async remove(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: { files: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    assertEditable(invoice.status as InvoiceStatus);

    await this.prisma.invoice.delete({ where: { id } });

    // The record is already gone, so a failed file deletion must not fail the
    // request. Just log it so it can be cleaned up later.
    for (const file of invoice.files) {
      try {
        await this.storageService.deleteFile(file.storageKey);
      } catch (error) {
        this.logger.error(
          `Failed to delete file ${file.storageKey} belonging to invoice ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { message: 'Invoice deleted successfully' };
  }

  private async getInvoiceOrFail(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }
}
