import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersService, type UserActor } from './users.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

const existingUser = {
  id: 'user-1',
  email: 'finance@ofda.local',
  name: 'Finance User',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [{ role: { id: 'role-1', name: 'FINANCE', description: null } }],
  companyAccess: [
    {
      company: { id: 'company-oi', code: 'OI', name: 'PT Onduline Indonesia' },
    },
  ],
};

/** An actor in company OI; `isSuperAdmin` defaults to the administrator case. */
function actor(overrides: Partial<UserActor> = {}): UserActor {
  return {
    userId: 'admin-1',
    companyId: 'company-oi',
    isSuperAdmin: false,
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;

  const prismaMock = {
    company: { findUnique: vi.fn() },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    role: { findMany: vi.fn(), findUnique: vi.fn() },
    userRole: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
  };

  const rbacMock = { isSuperAdministrator: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    rbacMock.isSuperAdministrator.mockResolvedValue(false);
    prismaMock.company.findUnique.mockResolvedValue({ id: 'company-oi' });
    service = new UsersService(prismaMock as never, rbacMock as never);
  });

  describe('create', () => {
    it('pins an administrator-created user to the actor company', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'FINANCE' },
      ]);
      prismaMock.user.create.mockResolvedValue(existingUser);

      // An administrator passes a different company; it must be ignored.
      await service.create(
        {
          email: 'new@ofda.local',
          name: 'New',
          password: 'secret123',
          roleIds: ['role-1'],
          companyId: 'company-omi',
        },
        actor(),
      );

      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.companyAccess.create).toEqual({
        companyId: 'company-oi',
        isDefault: true,
      });
    });

    it('uses the chosen company for a super administrator', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'FINANCE' },
      ]);
      prismaMock.user.create.mockResolvedValue(existingUser);

      await service.create(
        {
          email: 'new@ofda.local',
          name: 'New',
          password: 'secret123',
          roleIds: ['role-1'],
          companyId: 'company-omi',
        },
        actor({ isSuperAdmin: true }),
      );

      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.companyAccess.create.companyId).toBe('company-omi');
    });

    it('rejects a super administrator who did not choose a company', async () => {
      await expect(
        service.create(
          {
            email: 'new@ofda.local',
            name: 'New',
            password: 'secret123',
            roleIds: ['role-1'],
          },
          actor({ isSuperAdmin: true }),
        ),
      ).rejects.toThrow(/company must be selected/);
    });

    it('rejects an email that is already taken', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'other' });

      await expect(
        service.create(
          {
            email: existingUser.email,
            name: 'X',
            password: 'secret123',
            roleIds: ['role-1'],
          },
          actor(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('leaves the password out of the returned result', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'FINANCE' },
      ]);
      prismaMock.user.create.mockResolvedValue(existingUser);

      const created = await service.create(
        {
          email: existingUser.email,
          name: 'Finance User',
          password: 'secret123',
          roleIds: ['role-1'],
        },
        actor(),
      );

      expect(created).not.toHaveProperty('password');
      expect(created.companies).toEqual([
        { id: 'company-oi', code: 'OI', name: 'PT Onduline Indonesia' },
      ]);
    });
  });

  describe('findAll company scoping', () => {
    it('scopes an administrator to their own company', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await service.findAll(actor());

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
        companyAccess: { some: { companyId: 'company-oi' } },
      });
    });

    it('lets a super administrator see every company', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await service.findAll(actor({ isSuperAdmin: true }));

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('cross-company protection', () => {
    it('stops an administrator from editing a user outside their company', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-2',
        companyAccess: [{ companyId: 'company-omi' }],
      });

      await expect(
        service.update('user-2', { name: 'X' }, actor()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a super administrator edit any user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-2',
        companyAccess: [{ companyId: 'company-omi' }],
      });
      prismaMock.user.update.mockResolvedValue(existingUser);

      await expect(
        service.update('user-2', { name: 'X' }, actor({ isSuperAdmin: true })),
      ).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('only sends the fields that were provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.user.update.mockResolvedValue(existingUser);

      await service.update('user-1', { name: 'New Name' }, actor());

      const { data } = prismaMock.user.update.mock.calls[0][0];
      expect(data).toEqual({
        email: undefined,
        name: 'New Name',
        isActive: undefined,
      });
      expect(data).not.toHaveProperty('password');
    });

    it('revokes active sessions when the password is changed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.user.update.mockResolvedValue(existingUser);

      await service.update('user-1', { password: 'newpassword1' }, actor());

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('prevents a user from deactivating their own account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });

      await expect(
        service.update('admin-1', { isActive: false }, actor()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('prevents a user from deleting their own account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });

      await expect(service.remove('admin-1', actor())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('prevents the last super administrator from being deleted', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.userRole.findFirst.mockResolvedValue({ userId: 'user-1' });
      prismaMock.userRole.count.mockResolvedValue(1);

      await expect(service.remove('user-1', actor())).rejects.toThrow(
        new BadRequestException(
          'At least one user must have the SUPER_ADMINISTRATOR role',
        ),
      );
    });

    it('deletes a regular user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.userRole.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', actor())).resolves.toEqual({
        message: 'User deleted successfully',
      });
      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });

  describe('super administrator escalation', () => {
    it('stops a plain administrator from granting the SUPER_ADMINISTRATOR role', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'role-super',
        name: 'SUPER_ADMINISTRATOR',
      });

      await expect(
        service.assignRole('user-1', 'role-super', actor()),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
    });

    it('lets a super administrator grant the role', async () => {
      rbacMock.isSuperAdministrator.mockResolvedValue(true);
      prismaMock.user.findUnique.mockResolvedValue(existingUser);
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'role-super',
        name: 'SUPER_ADMINISTRATOR',
      });

      await service.assignRole(
        'user-1',
        'role-super',
        actor({ isSuperAdmin: true, userId: 'super-1' }),
      );

      expect(prismaMock.userRole.upsert).toHaveBeenCalled();
    });

    it('stops a plain administrator from creating a super administrator', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.role.findMany.mockResolvedValue([
        { id: 'role-super', name: 'SUPER_ADMINISTRATOR' },
      ]);

      await expect(
        service.create(
          {
            email: 'new@ofda.local',
            name: 'New',
            password: 'secret123',
            roleIds: ['role-super'],
          },
          actor(),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('removeRole', () => {
    it('prevents a user from revoking their own SUPER_ADMINISTRATOR role', async () => {
      rbacMock.isSuperAdministrator.mockResolvedValue(true);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'super-1',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.userRole.findUnique.mockResolvedValue({
        role: { name: 'SUPER_ADMINISTRATOR' },
      });

      await expect(
        service.removeRole(
          'super-1',
          'role-super',
          actor({ isSuperAdmin: true, userId: 'super-1' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows the ADMINISTRATOR role to be revoked like any other', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...existingUser,
        id: 'admin-9',
        companyAccess: [{ companyId: 'company-oi' }],
      });
      prismaMock.userRole.findUnique.mockResolvedValue({
        role: { name: 'ADMINISTRATOR' },
      });

      await service.removeRole('admin-9', 'role-admin', actor());

      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'admin-9', roleId: 'role-admin' } },
      });
    });
  });
});
