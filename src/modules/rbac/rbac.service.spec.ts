import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from './rbac.service';

// PrismaService extends the Prisma generated client, a very large TypeScript
// source tree. Mocking the module means Vite does not have to transform those
// files while the tests run.
vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RbacService', () => {
  let service: RbacService;

  const prismaMock = {
    userRole: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    rolePermission: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(RbacService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserRoleNames', () => {
    it('maps the role relations into a list of names', async () => {
      prismaMock.userRole.findMany.mockResolvedValue([
        { role: { name: 'PURCHASER' } },
        { role: { name: 'FINANCE' } },
      ]);

      await expect(service.getUserRoleNames('user-1')).resolves.toEqual([
        'PURCHASER',
        'FINANCE',
      ]);
    });
  });

  describe('getUserPermissions', () => {
    it('merges permissions across roles without duplicates', async () => {
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { permission: { code: 'ocr:view' } },
        { permission: { code: 'ocr:upload' } },
        { permission: { code: 'ocr:view' } },
      ]);

      await expect(service.getUserPermissions('user-1')).resolves.toEqual([
        'ocr:view',
        'ocr:upload',
      ]);
    });
  });

  describe('hasAnyPermission', () => {
    it('lets SUPER_ADMINISTRATOR through without checking permissions', async () => {
      prismaMock.userRole.count.mockResolvedValue(1);

      await expect(
        service.hasAnyPermission('super-1', ['ocr:post_bc']),
      ).resolves.toBe(true);

      expect(prismaMock.userRole.count).toHaveBeenCalledWith({
        where: {
          userId: 'super-1',
          role: { name: { in: ['SUPER_ADMINISTRATOR'] } },
        },
      });
      expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('makes ADMINISTRATOR hold the permission rather than bypass it', async () => {
      // Not a super administrator, so the explicit grants decide.
      prismaMock.userRole.count.mockResolvedValue(0);
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { permission: { code: 'user:manage' } },
      ]);

      await expect(
        service.hasAnyPermission('admin-1', ['company:switch']),
      ).resolves.toBe(false);

      expect(prismaMock.rolePermission.findMany).toHaveBeenCalled();
    });

    it('lets a user through when one of the permissions matches', async () => {
      prismaMock.userRole.count.mockResolvedValue(0);
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { permission: { code: 'ocr:review' } },
      ]);

      await expect(
        service.hasAnyPermission('user-1', ['ocr:upload', 'ocr:review']),
      ).resolves.toBe(true);
    });

    it('rejects a user when no permission matches', async () => {
      prismaMock.userRole.count.mockResolvedValue(0);
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { permission: { code: 'ocr:grn_view' } },
      ]);

      await expect(
        service.hasAnyPermission('user-1', ['ocr:upload', 'ocr:review']),
      ).resolves.toBe(false);
    });

    it('lets through a handler that requests no permissions at all', async () => {
      await expect(service.hasAnyPermission('user-1', [])).resolves.toBe(true);

      expect(prismaMock.userRole.count).not.toHaveBeenCalled();
    });
  });
});
