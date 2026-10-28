import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import { ExpenseReportsService } from './expense-reports.service';

@ApiTags('Expense Reports')
@ApiBearerAuth()
@Controller('expense/reports')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class ExpenseReportsController {
  constructor(private readonly reportsService: ExpenseReportsService) {}

  @Get('entertainment-nominative')
  @Permissions('expense:report')
  @ApiOperation({
    summary:
      'Nominative list of entertainment and similar expenses for tax purposes ("Daftar Nominatif Entertainment dan Sejenisnya")',
  })
  entertainmentNominative(
    @CurrentCompany() company: CompanyContext,
    @Query('year', ParseIntPipe) year: number,
    @Query('month') month?: string,
  ) {
    return this.reportsService.entertainmentNominative(
      company.id,
      year,
      month ? Number(month) : undefined,
    );
  }

  @Get('me/expense-form')
  @Permissions('expense:entry', 'expense:view')
  @ApiOperation({
    summary: 'The signed-in employee’s own expense recap for a period',
  })
  myExpenseForm(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.reportsService.myExpenseForm(
      company.id,
      user.id,
      periodStart,
      periodEnd,
    );
  }

  @Get('employees/:employeeId/expense-form')
  @Permissions('expense:report', 'expense:view_all')
  @ApiOperation({
    summary:
      'Expense form per employee, one row per date that has transactions',
  })
  employeeExpenseForm(
    @CurrentCompany() company: CompanyContext,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.reportsService.employeeExpenseForm(
      company.id,
      employeeId,
      periodStart,
      periodEnd,
    );
  }

  @Get('dashboard')
  @Permissions('expense:report', 'expense:view_all')
  @ApiOperation({ summary: 'Expense summary for the management dashboard' })
  dashboard(
    @CurrentCompany() company: CompanyContext,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();

    return this.reportsService.dashboard(
      company.id,
      year ? Number(year) : now.getUTCFullYear(),
      month ? Number(month) : now.getUTCMonth() + 1,
    );
  }
}
