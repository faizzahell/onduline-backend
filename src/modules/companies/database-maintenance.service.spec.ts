import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseMaintenanceService } from './database-maintenance.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('node:fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe('DatabaseMaintenanceService', () => {
  let service: DatabaseMaintenanceService;

  const deleteManyModels = [
    'bcJournalBatch',
    'expenseOcrJob',
    'expenseEntry',
    'expenseClaim',
    'pettyCashBatch',
    'cashAdvance',
    'invoice',
    'employee',
    'expenseCategory',
    'approvalRule',
    'department',
    'areaCode',
    'salesArea',
    'marketingCode',
    'documentSequence',
    'userCompanyAccess',
  ] as const;

  const prismaMock: Record<string, unknown> = {
    company: {
      count: vi.fn().mockResolvedValue(2),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'u-1' }]),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    userRole: { count: vi.fn() },
    $transaction: vi.fn(),
  };

  for (const model of deleteManyModels) {
    prismaMock[model] = { deleteMany: vi.fn() };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.company = {
      count: vi.fn().mockResolvedValue(2),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    };
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (callback: unknown) =>
        (callback as (tx: unknown) => Promise<unknown>)(prismaMock),
    );
    service = new DatabaseMaintenanceService(prismaMock as never);
  });

  it('rejects a clear without the confirmation phrase', async () => {
    await expect(
      service.clear({ scope: 'all', confirm: 'nope' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('clear all keeps super administrators and drops every company', async () => {
    const user = prismaMock.user as { findMany: ReturnType<typeof vi.fn> };
    user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);

    const result = await service.clear({ scope: 'all', confirm: 'CLEAR' });

    // Only non-super-administrator accounts are selected for deletion.
    expect(user.findMany).toHaveBeenCalledWith({
      where: {
        roles: { none: { role: { name: 'SUPER_ADMINISTRATOR' } } },
      },
      select: { id: true },
    });
    expect(
      (prismaMock.company as { deleteMany: ReturnType<typeof vi.fn> })
        .deleteMany,
    ).toHaveBeenCalled();
    expect(result.scope).toBe('all');
    expect(result.deleted.users).toBe(2);
  });

  it('clear by company rejects an unknown company', async () => {
    (
      prismaMock.company as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue(null);

    await expect(
      service.clear({ scope: 'company', companyId: 'nope', confirm: 'CLEAR' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('export rejects an unknown company', async () => {
    (
      prismaMock.company as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue(null);

    await expect(service.exportCompany('nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});
