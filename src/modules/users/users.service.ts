import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService, SUPER_ADMINISTRATOR_ROLE } from '../rbac/rbac.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

/** The company an account can reach, as shown in user management. */
export interface PublicUserCompany {
  id: string;
  code: string;
  name: string;
}

/** The user shape returned to the client, without the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: { id: string; name: string; description: string | null }[];
  companies: PublicUserCompany[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Who is performing a user-management action, and the company they are acting
 * in.
 *
 * A super administrator is cross-company: they see and edit every account and
 * pick the company when creating one. A plain administrator is pinned to their
 * active company and can only touch accounts that belong to it.
 */
export interface UserActor {
  userId: string;
  /** The actor's active company, or null for a super admin with none yet. */
  companyId: string | null;
  isSuperAdmin: boolean;
}

const userInclude = {
  roles: { include: { role: true } },
  companyAccess: {
    include: {
      company: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  async findAllRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
  }

  async create(
    createUserDto: CreateUserDto,
    actor: UserActor,
  ): Promise<PublicUser> {
    const { email, name, password, roleIds } = createUserDto;

    // A super administrator chooses the company; an administrator can only ever
    // create accounts inside their own, so their choice is forced.
    const companyId = actor.isSuperAdmin
      ? createUserDto.companyId
      : actor.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'A company must be selected for the new user',
      );
    }

    await this.assertCompanyExists(companyId);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email is already in use');
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });

    if (roles.length !== new Set(roleIds).size) {
      throw new NotFoundException('One or more roles were not found');
    }

    await this.assertMayGrantRoles(
      roles.map((role) => role.name),
      actor.userId,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        companyAccess: {
          create: { companyId, isDefault: true },
        },
      },
      include: userInclude,
    });

    return this.toPublicUser(user);
  }

  async findAll(actor: UserActor): Promise<PublicUser[]> {
    // A super administrator sees everyone. An administrator only sees accounts
    // that can reach their company; with no company they see nothing.
    if (!actor.isSuperAdmin && !actor.companyId) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: actor.isSuperAdmin
        ? {}
        : { companyAccess: { some: { companyId: actor.companyId! } } },
      orderBy: { createdAt: 'desc' },
      include: userInclude,
    });

    return users.map((user) => this.toPublicUser(user));
  }

  async findOne(id: string, actor: UserActor): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.assertActorMayTouch(user, actor);

    return this.toPublicUser(user);
  }

  /**
   * Updates only the fields that were sent. Fields left out are kept as they
   * are.
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor: UserActor,
  ): Promise<PublicUser> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      include: { companyAccess: { select: { companyId: true } } },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    this.assertActorMayTouch(existingUser, actor);

    if (updateUserDto.isActive === false && id === actor.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    if (updateUserDto.email !== undefined) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
        select: { id: true },
      });

      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictException('Email is already in use');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: updateUserDto.email,
        name: updateUserDto.name,
        isActive: updateUserDto.isActive,
        ...(updateUserDto.password !== undefined && {
          password: await bcrypt.hash(updateUserDto.password, BCRYPT_ROUNDS),
        }),
      },
      include: userInclude,
    });

    // Revoke active sessions when the password changes or the account is
    // deactivated.
    if (
      updateUserDto.password !== undefined ||
      updateUserDto.isActive === false
    ) {
      await this.revokeRefreshTokens(id);
    }

    return this.toPublicUser(user);
  }

  async remove(id: string, actor: UserActor): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { companyAccess: { select: { companyId: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.assertActorMayTouch(user, actor);

    if (id === actor.userId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.assertNotLastSuperAdministrator(id);

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted successfully' };
  }

  async assignRole(
    userId: string,
    roleId: string,
    actor: UserActor,
  ): Promise<PublicUser> {
    await this.assertUserInActorScope(userId, actor);

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.assertMayGrantRoles([role.name], actor.userId);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });

    return this.findOne(userId, actor);
  }

  async removeRole(
    userId: string,
    roleId: string,
    actor: UserActor,
  ): Promise<PublicUser> {
    await this.assertUserInActorScope(userId, actor);

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: { role: { select: { name: true } } },
    });

    if (!userRole) {
      throw new NotFoundException('The user does not have this role');
    }

    if (userRole.role.name === SUPER_ADMINISTRATOR_ROLE) {
      await this.assertMayGrantRoles([SUPER_ADMINISTRATOR_ROLE], actor.userId);

      if (userId === actor.userId) {
        throw new BadRequestException(
          'You cannot revoke the SUPER_ADMINISTRATOR role from your own account',
        );
      }

      await this.assertNotLastSuperAdministrator(userId);
    }

    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });

    return this.findOne(userId, actor);
  }

  /**
   * Only a super administrator may hand out or take back the super
   * administrator role.
   *
   * Without this, anyone holding `user:manage` could promote themselves and
   * walk straight into the company-wide switches, which would make the
   * distinction between the two administrator roles meaningless.
   */
  private async assertMayGrantRoles(
    roleNames: string[],
    currentUserId: string,
  ): Promise<void> {
    if (!roleNames.includes(SUPER_ADMINISTRATOR_ROLE)) {
      return;
    }

    if (!(await this.rbacService.isSuperAdministrator(currentUserId))) {
      throw new ForbiddenException(
        'Only a super administrator can grant or revoke the SUPER_ADMINISTRATOR role',
      );
    }
  }

  /**
   * A plain administrator may only act on accounts that can reach their active
   * company. A super administrator is cross-company and passes unconditionally.
   */
  private assertActorMayTouch(
    user: { companyAccess: { companyId: string }[] },
    actor: UserActor,
  ): void {
    if (actor.isSuperAdmin) {
      return;
    }

    const sharesCompany = user.companyAccess.some(
      (access) => access.companyId === actor.companyId,
    );

    if (!sharesCompany) {
      throw new ForbiddenException('This user does not belong to your company');
    }
  }

  private async assertUserInActorScope(
    userId: string,
    actor: UserActor,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyAccess: { select: { companyId: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.assertActorMayTouch(user, actor);
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  /**
   * Stops the system from losing its last super administrator.
   *
   * That role is the only way back into the company-wide switches, so letting
   * the last holder go would lock everyone out of them for good.
   */
  private async assertNotLastSuperAdministrator(userId: string): Promise<void> {
    const isSuperAdministrator = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: SUPER_ADMINISTRATOR_ROLE } },
      select: { userId: true },
    });

    if (!isSuperAdministrator) {
      return;
    }

    const superAdministratorCount = await this.prisma.userRole.count({
      where: { role: { name: SUPER_ADMINISTRATOR_ROLE } },
    });

    if (superAdministratorCount <= 1) {
      throw new BadRequestException(
        'At least one user must have the SUPER_ADMINISTRATOR role',
      );
    }
  }

  private async revokeRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    roles: { role: { id: string; name: string; description: string | null } }[];
    companyAccess: {
      company: { id: string; code: string; name: string };
    }[];
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.roles.map((userRole) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        description: userRole.role.description,
      })),
      companies: user.companyAccess.map((access) => access.company),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
