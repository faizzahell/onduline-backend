import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RbacService } from '../../modules/rbac/rbac.service';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { RolesGuard } from './roles.guard';

vi.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let rbacService: { hasAnyRole: ReturnType<typeof vi.fn> };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'admin@ofda.local',
    roles: ['ADMINISTRATOR'],
  };

  beforeEach(() => {
    reflector = new Reflector();
    rbacService = { hasAnyRole: vi.fn() };
    guard = new RolesGuard(reflector, rbacService as unknown as RbacService);
  });

  it('lets through a handler without role metadata', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(rbacService.hasAnyRole).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMINISTRATOR']);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('always includes SUPER_ADMINISTRATOR in the allowed set', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMINISTRATOR']);
    rbacService.hasAnyRole.mockResolvedValue(true);

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);

    expect(rbacService.hasAnyRole).toHaveBeenCalledWith('user-1', [
      'SUPER_ADMINISTRATOR',
      'ADMINISTRATOR',
    ]);
  });

  it('rejects a user who holds none of the roles', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMINISTRATOR']);
    rbacService.hasAnyRole.mockResolvedValue(false);

    await expect(guard.canActivate(createContext(user))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
