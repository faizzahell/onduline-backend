import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OcrInvoiceController } from './ocr-invoice.controller';
import { OcrInvoiceService } from './ocr-invoice.service';

vi.mock('./ocr-invoice.service', () => ({
  OcrInvoiceService: class OcrInvoiceService {},
}));

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const allowAll = { canActivate: () => true };

const company = {
  id: 'company-1',
  code: 'OI',
  name: 'PT Onduline Indonesia',
  currency: 'IDR',
  ocrInvoiceEnabled: true,
  ocrExpenseEnabled: false,
};

function permissionsOf(handlerName: keyof OcrInvoiceController): string[] {
  return (
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      OcrInvoiceController.prototype[handlerName] as object,
    ) ?? []
  );
}

describe('OcrInvoiceController', () => {
  let controller: OcrInvoiceController;

  const serviceMock = {
    create: vi.fn(),
    createManual: vi.fn(),
    uploadFile: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getOCRJobs: vi.fn(),
    update: vi.fn(),
    validateInvoice: vi.fn(),
    submitToBusinessCentral: vi.fn(),
    bindPurchaseOrder: vi.fn(),
    findPurchaseOrderCandidates: vi.fn(),
    getFileForDownload: vi.fn(),
    remove: vi.fn(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'purchaser@ofda.local',
    roles: ['PURCHASER'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OcrInvoiceController],
      providers: [{ provide: OcrInvoiceService, useValue: serviceMock }],
    })
      // The guards are tested separately in permissions.guard.spec.ts; what is
      // checked here is the routing and the permission declarations.
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(CompanyAccessGuard)
      .useValue(allowAll)
      .overrideGuard(PermissionsGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get(OcrInvoiceController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('rejects an upload request without a file', () => {
    expect(() =>
      controller.uploadFile(company, 'invoice-1', {}, undefined),
    ).toThrow(BadRequestException);
  });

  it('takes the invoice creator id from the token', () => {
    controller.create(company, user, {});

    expect(serviceMock.create).toHaveBeenCalledWith('company-1', 'user-1', {});
  });

  describe('permission declarations', () => {
    it('lets both FINANCE and PURCHASER reviewers correct the extraction', () => {
      expect(permissionsOf('update')).toEqual(['ocr:upload', 'ocr:review']);
    });

    it('uses a dedicated permission for submitting to Business Central', () => {
      expect(permissionsOf('submitToBusinessCentral')).toEqual([
        'ocr:submit_bc',
      ]);
    });

    it('uses the PO resolution permission for linking a PO', () => {
      expect(permissionsOf('bindPurchaseOrder')).toEqual(['ocr:resolve_po']);
    });

    it('lets the warehouse view the invoice list', () => {
      expect(permissionsOf('findAll')).toEqual(['ocr:view', 'ocr:grn_view']);
    });
  });
});
