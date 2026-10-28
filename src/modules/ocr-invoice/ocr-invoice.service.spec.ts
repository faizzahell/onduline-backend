import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BusinessCentralService } from '../business-central/business-central.service';
import { OcrInvoiceService } from './ocr-invoice.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('../../common/storage/storage.service', () => ({
  StorageService: class StorageService {},
}));

const extractedInvoice = {
  id: 'invoice-1',
  status: 'EXTRACTED',
  vendorName: 'PT Sinar Baja Logam',
  invoiceNumber: 'INV-001',
  poNumber: null,
  currency: 'IDR',
  totalAmount: 185_400_000,
  files: [],
};

const companyWithOcr = {
  id: 'company-1',
  code: 'OI',
  name: 'PT Onduline Indonesia',
  currency: 'IDR',
  ocrInvoiceEnabled: true,
  ocrExpenseEnabled: false,
};

describe('OcrInvoiceService', () => {
  let service: OcrInvoiceService;

  const prismaMock = {
    invoice: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    invoiceLine: { deleteMany: vi.fn(), createMany: vi.fn() },
    invoiceFile: { create: vi.fn(), findFirst: vi.fn() },
    oCRJob: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };

  const storageMock = {
    saveInvoiceFile: vi.fn(),
    deleteFile: vi.fn(),
    exists: vi.fn(),
    createReadStream: vi.fn(),
    getAbsolutePath: vi.fn(),
  };

  const businessCentralMock = {
    isMocked: true,
    findOpenPurchaseOrders: vi.fn(),
    submitPurchaseInvoice: vi.fn(),
  };

  const queueMock = { add: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();

    // Runs the transaction callback with the same client.
    prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as unknown[]),
    );

    service = new OcrInvoiceService(
      prismaMock as never,
      storageMock as never,
      businessCentralMock as unknown as BusinessCentralService,
      queueMock as never,
    );
  });

  describe('findOne', () => {
    it('throws 404 for an invoice that does not exist', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('company-1', 'does-not-exist'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('does not touch fields that were not sent', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);
      prismaMock.invoice.findUniqueOrThrow.mockResolvedValue(extractedInvoice);

      await service.update('company-1', 'invoice-1', {
        vendorName: 'New Vendor',
      });

      const { data } = prismaMock.invoice.update.mock.calls[0][0];
      expect(data.vendorName).toBe('New Vendor');
      expect(data.invoiceNumber).toBeUndefined();
      expect(data).not.toHaveProperty('invoiceDate');
      expect(data).not.toHaveProperty('dueDate');
    });

    it('does not delete line items when lines is not sent', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);
      prismaMock.invoice.findUniqueOrThrow.mockResolvedValue(extractedInvoice);

      await service.update('company-1', 'invoice-1', {
        vendorName: 'New Vendor',
      });

      expect(prismaMock.invoiceLine.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces all line items when lines is sent', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);
      prismaMock.invoice.findUniqueOrThrow.mockResolvedValue(extractedInvoice);

      await service.update('company-1', 'invoice-1', {
        lines: [{ description: 'Steel Coil', quantity: 2, unitPrice: 100 }],
      });

      expect(prismaMock.invoiceLine.deleteMany).toHaveBeenCalledWith({
        where: { invoiceId: 'invoice-1' },
      });
      expect(prismaMock.invoiceLine.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ lineNumber: 1, description: 'Steel Coil' }),
        ],
      });
    });

    it('rejects changes to an invoice already sent to Business Central', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'SUBMITTED',
      });

      await expect(
        service.update('company-1', 'invoice-1', { vendorName: 'New Vendor' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('uploadFile', () => {
    it('rejects an upload while OCR is still running', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'PROCESSING',
      });

      await expect(
        service.uploadFile(
          companyWithOcr,
          'invoice-1',
          {} as Express.Multer.File,
          true,
        ),
      ).rejects.toThrow(ConflictException);

      expect(storageMock.saveInvoiceFile).not.toHaveBeenCalled();
    });

    it('cleans up the file on disk when the database write fails', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'UPLOADED',
      });
      storageMock.saveInvoiceFile.mockResolvedValue({
        storageKey: 'invoices/invoice-1/file.pdf',
      });
      prismaMock.$transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.uploadFile(
          companyWithOcr,
          'invoice-1',
          {
            originalname: 'a.pdf',
            mimetype: 'application/pdf',
            size: 1,
          } as Express.Multer.File,
          true,
        ),
      ).rejects.toThrow('db down');

      expect(storageMock.deleteFile).toHaveBeenCalledWith(
        'invoices/invoice-1/file.pdf',
      );
      expect(queueMock.add).not.toHaveBeenCalled();
    });
  });

  describe('validateInvoice', () => {
    it('rejects a transition that skips the review stage', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'UPLOADED',
      });

      await expect(
        service.validateInvoice('company-1', 'invoice-1', 'user-1', {
          status: 'MATCHED' as never,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('records who validated the invoice', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);

      await service.validateInvoice('company-1', 'invoice-1', 'user-9', {
        status: 'VALIDATED' as never,
      });

      const { data } = prismaMock.invoice.update.mock.calls[0][0];
      expect(data).toMatchObject({
        status: 'VALIDATED',
        validatedById: 'user-9',
      });
    });
  });

  describe('submitToBusinessCentral', () => {
    it('rejects an invoice that is not yet MATCHED', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);

      await expect(
        service.submitToBusinessCentral('company-1', 'invoice-1'),
      ).rejects.toThrow(ConflictException);

      expect(businessCentralMock.submitPurchaseInvoice).not.toHaveBeenCalled();
    });

    it('submits to Business Central then marks it SUBMITTED', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'MATCHED',
      });
      businessCentralMock.submitPurchaseInvoice.mockResolvedValue({
        bcInvoiceNo: 'BC-001',
      });

      const result = await service.submitToBusinessCentral(
        'company-1',
        'invoice-1',
      );

      expect(result).toMatchObject({ bcInvoiceNo: 'BC-001', mocked: true });
      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'invoice-1' },
        data: { status: 'SUBMITTED' },
      });
    });
  });

  describe('findPurchaseOrderCandidates', () => {
    it('sorts candidates by highest match score', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(extractedInvoice);
      businessCentralMock.findOpenPurchaseOrders.mockResolvedValue([
        {
          poNumber: 'PO-DIFFERENT',
          vendorName: 'CV Entirely Different Name',
          totalAmount: 1_000,
        },
        {
          poNumber: 'PO-MATCH',
          vendorName: 'PT Sinar Baja Logam',
          totalAmount: 185_400_000,
        },
      ]);

      const { candidates, mocked } = await service.findPurchaseOrderCandidates(
        'company-1',
        'invoice-1',
      );

      expect(candidates[0].poNumber).toBe('PO-MATCH');
      expect(candidates[0].matchScorePercent).toBeGreaterThan(
        candidates[1].matchScorePercent,
      );
      expect(mocked).toBe(true);
    });
  });

  describe('getFileForDownload', () => {
    it('throws 404 when the file does not belong to that invoice', async () => {
      prismaMock.invoiceFile.findFirst.mockResolvedValue(null);

      await expect(
        service.getFileForDownload('company-1', 'invoice-1', 'other-file'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when the record exists but the file is gone from disk', async () => {
      prismaMock.invoiceFile.findFirst.mockResolvedValue({
        id: 'file-1',
        storageKey: 'invoices/invoice-1/a.pdf',
      });
      storageMock.exists.mockResolvedValue(false);

      await expect(
        service.getFileForDownload('company-1', 'invoice-1', 'file-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('rejects deleting an invoice that is already locked', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...extractedInvoice,
        status: 'POSTED',
      });

      await expect(service.remove('company-1', 'invoice-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

describe('OcrInvoiceService — OCR as an option', () => {
  const prismaMock = {
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    invoiceFile: { create: vi.fn() },
    invoiceLine: { createMany: vi.fn() },
    oCRJob: { create: vi.fn() },
    $transaction: vi.fn(),
  };

  const storageMock = {
    saveInvoiceFile: vi.fn(),
    deleteFile: vi.fn(),
  };

  const queueMock = { add: vi.fn() };

  const companyWithOcr = {
    id: 'company-1',
    code: 'OI',
    name: 'PT Onduline Indonesia',
    currency: 'IDR',
    ocrInvoiceEnabled: true,
    ocrExpenseEnabled: false,
  };

  const companyWithoutOcr = { ...companyWithOcr, ocrInvoiceEnabled: false };

  const uploadedFile = {
    originalname: 'invoice.pdf',
    mimetype: 'application/pdf',
    size: 1024,
  } as Express.Multer.File;

  let service: OcrInvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation((callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(prismaMock),
    );

    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      companyId: 'company-1',
      status: 'UPLOADED',
      source: 'MANUAL',
    });

    storageMock.saveInvoiceFile.mockResolvedValue({
      storageKey: 'invoices/invoice-1/file.pdf',
    });

    prismaMock.invoiceFile.create.mockResolvedValue({ id: 'file-1' });
    prismaMock.oCRJob.create.mockResolvedValue({ id: 'job-1' });

    service = new OcrInvoiceService(
      prismaMock as never,
      storageMock as never,
      { isMocked: true } as never,
      queueMock as never,
    );
  });

  it('stores the file without creating an OCR job during manual entry', async () => {
    const result = await service.uploadFile(
      companyWithOcr,
      'invoice-1',
      uploadedFile,
      false,
    );

    expect(result.ocrJob).toBeNull();
    expect(prismaMock.oCRJob.create).not.toHaveBeenCalled();
    expect(queueMock.add).not.toHaveBeenCalled();
    expect(prismaMock.invoiceFile.create).toHaveBeenCalled();
  });

  it('queues extraction when OCR is requested and enabled for the company', async () => {
    await service.uploadFile(companyWithOcr, 'invoice-1', uploadedFile, true);

    expect(prismaMock.oCRJob.create).toHaveBeenCalled();
    expect(queueMock.add).toHaveBeenCalledOnce();
  });

  it('rejects OCR when it is not enabled for that company', async () => {
    await expect(
      service.uploadFile(companyWithoutOcr, 'invoice-1', uploadedFile, true),
    ).rejects.toThrow(/OCR is not enabled for company OI/);

    expect(storageMock.saveInvoiceFile).not.toHaveBeenCalled();
  });

  it('still allows manual uploads for a company without OCR', async () => {
    const result = await service.uploadFile(
      companyWithoutOcr,
      'invoice-1',
      uploadedFile,
      false,
    );

    expect(result.ocrJob).toBeNull();
  });

  it('marks a manual invoice as EXTRACTED right away, along with its lines', async () => {
    prismaMock.invoice.create.mockResolvedValue({ id: 'invoice-9' });
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'invoice-9',
      companyId: 'company-1',
      status: 'EXTRACTED',
      source: 'MANUAL',
      files: [],
      ocrJobs: [],
      lines: [],
    });

    await service.createManual('company-1', 'user-1', {
      vendorName: 'PT Sinar Baja Logam',
      lines: [{ description: 'Steel Coil', quantity: 2, unitPrice: 100 }],
    });

    expect(prismaMock.invoice.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'company-1',
      source: 'MANUAL',
      status: 'EXTRACTED',
    });

    expect(prismaMock.invoiceLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ lineNumber: 1, description: 'Steel Coil' }),
      ],
    });
  });
});
