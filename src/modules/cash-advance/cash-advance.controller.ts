import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CashAdvanceService } from './cash-advance.service';
import {
  CashAdvanceActionDto,
  CreateCashAdvanceDto,
  RejectCashAdvanceDto,
  SettleCashAdvanceDto,
} from './dto/cash-advance.dto';

@ApiTags('Cash Advance')
@ApiBearerAuth()
@Controller('cash-advances')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class CashAdvanceController {
  constructor(private readonly advanceService: CashAdvanceService) {}

  @Get()
  @Permissions('advance:request', 'advance:approve', 'expense:view_all')
  list(
    @CurrentCompany() company: CompanyContext,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.advanceService.list(company.id, { status, type });
  }

  @Post()
  @Permissions('advance:request')
  @ApiOperation({
    summary: 'Request an advance, either case-by-case or yearly raised by HR',
  })
  create(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCashAdvanceDto,
  ) {
    return this.advanceService.create(company.id, user.id, dto);
  }

  @Get(':id')
  @Permissions('advance:request', 'advance:approve', 'expense:view_all')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.advanceService.findOne(company.id, id);
  }

  @Post(':id/submit')
  @Permissions('advance:request')
  submit(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.advanceService.submit(company.id, id);
  }

  @Post(':id/review')
  @Permissions('advance:approve')
  review(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashAdvanceActionDto,
  ) {
    return this.advanceService.review(company.id, user.id, id, dto.remark);
  }

  @Post(':id/approve')
  @Permissions('advance:approve')
  approve(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashAdvanceActionDto,
  ) {
    return this.advanceService.approve(company.id, user.id, id, dto.remark);
  }

  @Post(':id/post')
  @Permissions('advance:post')
  postAdvance(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashAdvanceActionDto,
  ) {
    return this.advanceService.post(company.id, user.id, id, dto.remark);
  }

  @Post(':id/request-revision')
  @Permissions('advance:approve')
  requestRevision(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCashAdvanceDto,
  ) {
    return this.advanceService.requestRevision(
      company.id,
      user.id,
      id,
      dto.remark,
    );
  }

  @Get(':id/settlement-preview')
  @Permissions('advance:post', 'expense:view_all')
  @ApiOperation({
    summary: 'Suggested year-end settlement amount for a yearly advance',
  })
  settlementPreview(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.advanceService.calculateSettlement(company.id, id);
  }

  @Post(':id/settle')
  @Permissions('advance:post')
  @ApiOperation({ summary: 'Settle a yearly advance at year end' })
  settle(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleCashAdvanceDto,
  ) {
    return this.advanceService.settle(company.id, id, dto);
  }
}
