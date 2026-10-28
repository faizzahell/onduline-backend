import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import { RbacService } from '../rbac/rbac.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

vi.mock('./users.service', () => ({
  UsersService: class UsersService {},
}));

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const allowAll = { canActivate: () => true };

describe('UsersController', () => {
  let controller: UsersController;

  const usersServiceMock = {
    findAllRoles: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    assignRole: vi.fn(),
    removeRole: vi.fn(),
  };

  const rbacServiceMock = {
    isSuperAdministrator: vi.fn().mockResolvedValue(false),
  };

  const currentUser: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@ofda.local',
    roles: ['ADMINISTRATOR'],
  };

  const company: CompanyContext = {
    id: 'company-oi',
    code: 'OI',
    name: 'PT Onduline Indonesia',
    currency: 'IDR',
    ocrInvoiceEnabled: false,
    ocrExpenseEnabled: false,
  };

  /** The actor the controller is expected to build from the user + company. */
  const actor = {
    userId: 'admin-1',
    companyId: 'company-oi',
    isSuperAdmin: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    rbacServiceMock.isSuperAdministrator.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        { provide: RbacService, useValue: rbacServiceMock },
      ],
    })
      // The guards are tested separately.
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(CompanyAccessGuard)
      .useValue(allowAll)
      .overrideGuard(PermissionsGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get(UsersController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('builds the actor from the signed-in user and active company on update', async () => {
    await controller.update('user-1', { name: 'New' }, currentUser, company);

    expect(usersServiceMock.update).toHaveBeenCalledWith(
      'user-1',
      { name: 'New' },
      actor,
    );
  });

  it('marks the actor as super admin when the role is held', async () => {
    rbacServiceMock.isSuperAdministrator.mockResolvedValue(true);

    await controller.findAll(currentUser, company);

    expect(usersServiceMock.findAll).toHaveBeenCalledWith({
      ...actor,
      isSuperAdmin: true,
    });
  });

  it('passes the actor when deleting', async () => {
    await controller.remove('user-1', currentUser, company);

    expect(usersServiceMock.remove).toHaveBeenCalledWith('user-1', actor);
  });

  it('passes the actor when revoking a role', async () => {
    await controller.removeRole('user-1', 'role-1', currentUser, company);

    expect(usersServiceMock.removeRole).toHaveBeenCalledWith(
      'user-1',
      'role-1',
      actor,
    );
  });
});
