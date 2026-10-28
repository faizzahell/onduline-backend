import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentCompanyOptional } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import { RbacService } from '../rbac/rbac.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, type UserActor } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('user:manage')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * Builds the actor context every action is scoped against: who is acting,
   * which company they are acting in, and whether they are cross-company.
   */
  private async resolveActor(
    user: AuthenticatedUser,
    company?: CompanyContext,
  ): Promise<UserActor> {
    return {
      userId: user.id,
      companyId: company?.id ?? null,
      isSuperAdmin: await this.rbacService.isSuperAdministrator(user.id),
    };
  }

  @Get('roles')
  @ApiOperation({ summary: 'List the roles that can be assigned to a user' })
  getRoles() {
    return this.usersService.findAllRoles();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user along with their initial roles' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.create(
      createUserDto,
      await this.resolveActor(user, company),
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List users. Administrators see only their company, super administrators see all.',
  })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.findAll(await this.resolveActor(user, company));
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.findOne(
      id,
      await this.resolveActor(user, company),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.update(
      id,
      updateUserDto,
      await this.resolveActor(user, company),
    );
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.remove(id, await this.resolveActor(user, company));
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Add a role to a user' })
  async assignRole(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() assignRoleDto: AssignRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.assignRole(
      userId,
      assignRoleDto.roleId,
      await this.resolveActor(user, company),
    );
  }

  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Revoke a role from a user' })
  async removeRole(
    @Param('id', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompanyOptional() company?: CompanyContext,
  ) {
    return this.usersService.removeRole(
      userId,
      roleId,
      await this.resolveActor(user, company),
    );
  }
}
