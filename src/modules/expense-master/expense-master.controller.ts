import {
  Body,
  Controller,
  Delete,
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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { CompanyContext } from '../../common/types/company-context';
import {
  CreateExpenseRateDto,
  UpsertDimensionDto,
  UpsertExpenseCategoryDto,
} from './dto/master-data.dto';
import {
  type DimensionKind,
  ExpenseMasterService,
} from './expense-master.service';

const DIMENSION_KINDS: DimensionKind[] = [
  'departments',
  'area-codes',
  'sales-areas',
  'marketing-codes',
];

@ApiTags('Expense Master Data')
@ApiBearerAuth()
@Controller('expense/master')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class ExpenseMasterController {
  constructor(private readonly masterService: ExpenseMasterService) {}

  @Get('categories')
  @Permissions('expense:entry', 'expense:view', 'expense:master')
  @ApiOperation({ summary: 'List of expense categories and subcategories' })
  listCategories(
    @CurrentCompany() company: CompanyContext,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.masterService.listCategories(company.id, includeInactive);
  }

  @Post('categories')
  @Permissions('expense:master')
  createCategory(
    @CurrentCompany() company: CompanyContext,
    @Body() dto: UpsertExpenseCategoryDto,
  ) {
    return this.masterService.createCategory(company.id, dto);
  }

  @Put('categories/:id')
  @Permissions('expense:master')
  updateCategory(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertExpenseCategoryDto,
  ) {
    return this.masterService.updateCategory(company.id, id, dto);
  }

  @Delete('categories/:id')
  @Permissions('expense:master')
  @ApiOperation({
    summary: 'Deactivate a category; historical data stays intact',
  })
  deactivateCategory(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.masterService.deactivateCategory(company.id, id);
  }

  @Post('categories/:id/rates')
  @Permissions('expense:master')
  @ApiOperation({
    summary: 'Add a new fixed rate, for example the daily meal allowance rate',
  })
  addCategoryRate(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExpenseRateDto,
  ) {
    return this.masterService.addCategoryRate(company.id, id, dto);
  }

  @Get('approval-rules')
  @Permissions('expense:master')
  @ApiOperation({ summary: 'The approval matrix currently in effect' })
  listApprovalRules(@CurrentCompany() company: CompanyContext) {
    return this.masterService.listApprovalRules(company.id);
  }

  @Get('dimensions/:kind')
  @Permissions('expense:entry', 'expense:view', 'expense:master')
  @ApiOperation({
    summary:
      'BC dimensions: departments, area-codes, sales-areas, or marketing-codes',
  })
  listDimension(
    @CurrentCompany() company: CompanyContext,
    @Param('kind') kind: string,
  ) {
    return this.masterService.listDimension(this.parseKind(kind), company.id);
  }

  @Post('dimensions/:kind')
  @Permissions('expense:master')
  createDimension(
    @CurrentCompany() company: CompanyContext,
    @Param('kind') kind: string,
    @Body() dto: UpsertDimensionDto,
  ) {
    return this.masterService.createDimension(
      this.parseKind(kind),
      company.id,
      dto,
    );
  }

  @Put('dimensions/:kind/:id')
  @Permissions('expense:master')
  updateDimension(
    @CurrentCompany() company: CompanyContext,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertDimensionDto,
  ) {
    return this.masterService.updateDimension(
      this.parseKind(kind),
      company.id,
      id,
      dto,
    );
  }

  private parseKind(kind: string): DimensionKind {
    if (!DIMENSION_KINDS.includes(kind as DimensionKind)) {
      throw new Error(
        `Unknown dimension kind. Options: ${DIMENSION_KINDS.join(', ')}`,
      );
    }

    return kind as DimensionKind;
  }
}
