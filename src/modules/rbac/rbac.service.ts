import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The top-level role. It bypasses every permission check, which makes it the
 * only role that reaches the company-wide switches: enabling OCR per company
 * and moving the active company from one entity to another.
 */
export const SUPER_ADMINISTRATOR_ROLE = 'SUPER_ADMINISTRATOR';

/**
 * The application administrator. It holds every functional permission but is
 * deliberately **not** a bypass role, so the company-wide switches stay with
 * the super administrator alone.
 */
export const ADMINISTRATOR_ROLE = 'ADMINISTRATOR';

/** Roles allowed to act on an approval step they are not assigned to. */
export const APPROVAL_OVERRIDE_ROLES = [
  SUPER_ADMINISTRATOR_ROLE,
  ADMINISTRATOR_ROLE,
] as const;

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /** The names of every role the user holds. */
  async getUserRoleNames(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });

    return userRoles.map((userRole) => userRole.role.name);
  }

  /** The user's effective permission codes, merged across all of their roles. */
  async getUserPermissions(userId: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { userId } } } },
      select: { permission: { select: { code: true } } },
    });

    const codes = rolePermissions.map(
      (rolePermission) => rolePermission.permission.code,
    );

    return [...new Set(codes)];
  }

  /** True when the user holds at least one of the given roles. */
  async hasAnyRole(
    userId: string,
    roleNames: readonly string[],
  ): Promise<boolean> {
    if (roleNames.length === 0) {
      return false;
    }

    const count = await this.prisma.userRole.count({
      where: { userId, role: { name: { in: [...roleNames] } } },
    });

    return count > 0;
  }

  async isSuperAdministrator(userId: string): Promise<boolean> {
    return this.hasAnyRole(userId, [SUPER_ADMINISTRATOR_ROLE]);
  }

  /**
   * True when the user holds **any one** of the requested permissions.
   *
   * SUPER_ADMINISTRATOR always passes. Every other role, ADMINISTRATOR
   * included, has to actually hold the permission, which is what keeps
   * `company:manage` and `company:switch` out of their reach.
   */
  async hasAnyPermission(
    userId: string,
    requiredPermissions: string[],
  ): Promise<boolean> {
    if (requiredPermissions.length === 0) {
      return true;
    }

    if (await this.isSuperAdministrator(userId)) {
      return true;
    }

    const permissions = await this.getUserPermissions(userId);

    return requiredPermissions.some((permission) =>
      permissions.includes(permission),
    );
  }

  async hasPermission(
    userId: string,
    requiredPermission: string,
  ): Promise<boolean> {
    return this.hasAnyPermission(userId, [requiredPermission]);
  }

  /**
   * The user's effective roles and permissions, used at login and by
   * `GET /auth/me` so the frontend can hide menus that are not allowed.
   */
  async getUserAccess(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const [roles, permissions] = await Promise.all([
      this.getUserRoleNames(userId),
      this.getUserPermissions(userId),
    ]);

    return { roles, permissions };
  }
}
