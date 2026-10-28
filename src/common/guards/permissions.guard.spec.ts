import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RbacService } from '../../modules/rbac/rbac.service';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { PermissionsGuard } from './permissions.guard';

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

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let rbacService: { hasAnyPermission: ReturnType<typeof vi.fn> };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'finance@ofda.local',
    roles: ['FINANCE'],
  };

  beforeEach(() => {
    reflector = new Reflector();
    rbacService = { hasAnyPermission: vi.fn() };

    guard = new PermissionsGuard(
      reflector,
      rbacService as unknown as RbacService,
    );
  });

  it('lets through a handler without permission metadata', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(rbacService.hasAnyPermission).not.toHaveBeenCalled();
  });

  it('rejects a request without an authenticated user', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ocr:view']);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets through a user who has one of the permissions', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      'ocr:upload',
      'ocr:review',
    ]);
    rbacService.hasAnyPermission.mockResolvedValue(true);

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);

    expect(rbacService.hasAnyPermission).toHaveBeenCalledWith('user-1', [
      'ocr:upload',
      'ocr:review',
    ]);
  });

  it('rejects a user who has none of the permissions', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ocr:submit_bc']);
    rbacService.hasAnyPermission.mockResolvedValue(false);

    await expect(guard.canActivate(createContext(user))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
