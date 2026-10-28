import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RbacService } from '../../modules/rbac/rbac.service';
import { CompanyContextService } from './company-context.service';

vi.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const oi = {
  id: 'company-oi',
  code: 'OI',
  name: 'PT Onduline Indonesia',
  currency: 'IDR',
  ocrInvoiceEnabled: true,
  ocrExpenseEnabled: false,
};

const omi = {
  id: 'company-omi',
  code: 'OMI',
  name: 'PT Onduline Material Indonesia',
  currency: 'IDR',
  ocrInvoiceEnabled: false,
  ocrExpenseEnabled: false,
};

describe('CompanyContextService', () => {
  let service: CompanyContextService;

  const prismaMock = {
    userCompanyAccess: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const rbacMock = { hasAnyPermission: vi.fn() };

  /** Grants both companies, with OI as the default. */
  function grantBoth() {
    prismaMock.userCompanyAccess.findMany.mockResolvedValue([
      { isDefault: true, company: oi },
      { isDefault: false, company: omi },
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();

    service = new CompanyContextService(
      prismaMock as never,
      rbacMock as unknown as RbacService,
    );
  });

  describe('resolveActiveCompany', () => {
    it('rejects a user without access to any company', async () => {
      prismaMock.userCompanyAccess.findMany.mockResolvedValue([]);

      await expect(service.resolveActiveCompany('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('falls back to the default company when none is requested', async () => {
      grantBoth();

      await expect(service.resolveActiveCompany('user-1')).resolves.toEqual(oi);
      expect(rbacMock.hasAnyPermission).not.toHaveBeenCalled();
    });

    it('moves a super administrator to the company they asked for', async () => {
      grantBoth();
      rbacMock.hasAnyPermission.mockResolvedValue(true);

      await expect(
        service.resolveActiveCompany('super-1', omi.id),
      ).resolves.toEqual(omi);
    });

    it('pins a user who cannot switch to their default company', async () => {
      grantBoth();
      rbacMock.hasAnyPermission.mockResolvedValue(false);

      // Even with access to OMI and a stale header asking for it, an
      // ADMINISTRATOR stays on OI.
      await expect(
        service.resolveActiveCompany('admin-1', omi.id),
      ).resolves.toEqual(oi);

      expect(rbacMock.hasAnyPermission).toHaveBeenCalledWith('admin-1', [
        'company:switch',
      ]);
    });

    it('rejects a company the super administrator has no access to', async () => {
      grantBoth();
      rbacMock.hasAnyPermission.mockResolvedValue(true);

      await expect(
        service.resolveActiveCompany('super-1', 'company-obm'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listSelectableCompanies', () => {
    it('offers every granted company to a super administrator', async () => {
      grantBoth();
      rbacMock.hasAnyPermission.mockResolvedValue(true);

      const companies = await service.listSelectableCompanies('super-1');

      expect(companies.map((company) => company.code)).toEqual(['OI', 'OMI']);
    });

    it('offers only the default company when the user cannot switch', async () => {
      grantBoth();
      rbacMock.hasAnyPermission.mockResolvedValue(false);

      const companies = await service.listSelectableCompanies('admin-1');

      expect(companies.map((company) => company.code)).toEqual(['OI']);
    });

    it('skips the permission lookup for a user with a single company', async () => {
      prismaMock.userCompanyAccess.findMany.mockResolvedValue([
        { isDefault: true, company: oi },
      ]);

      const companies = await service.listSelectableCompanies('user-1');

      expect(companies).toHaveLength(1);
      expect(rbacMock.hasAnyPermission).not.toHaveBeenCalled();
    });
  });
});
