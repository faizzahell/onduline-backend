import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import { UpsertEmployeeDto } from './dto/master-data.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('me')
  @Permissions('expense:entry', 'expense:view')
  @ApiOperation({ summary: 'Employee record of the signed-in account' })
  findMe(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.findByUser(company.id, user.id);
  }

  @Get()
  @Permissions('expense:master', 'expense:view_all')
  listAll(
    @CurrentCompany() company: CompanyContext,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.employeesService.list(company.id, includeInactive);
  }

  @Get(':id')
  @Permissions('expense:master', 'expense:view_all')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employeesService.findOne(company.id, id);
  }

  @Post()
  @Permissions('expense:master')
  @ApiOperation({
    summary:
      'Create an employee with their BC dimensions and login account link',
  })
  create(
    @CurrentCompany() company: CompanyContext,
    @Body() dto: UpsertEmployeeDto,
  ) {
    return this.employeesService.create(company.id, dto);
  }

  @Put(':id')
  @Permissions('expense:master')
  update(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertEmployeeDto,
  ) {
    return this.employeesService.update(company.id, id, dto);
  }
}
