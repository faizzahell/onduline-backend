import {
  Body,
  Controller,
  Delete,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import {
  ApprovalActionDto,
  RequestRevisionDto,
  SubmitClaimDto,
} from './dto/expense-claim.dto';
import { ExpenseClaimsService } from './expense-claims.service';

@ApiTags('Expense Claims')
@ApiBearerAuth()
@Controller('expense/claims')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard, RolesGuard)
export class ExpenseClaimsController {
  constructor(private readonly claimsService: ExpenseClaimsService) {}

  @Get('preview')
  @Permissions('expense:entry')
  @ApiOperation({
    summary:
      'Preview the entries that will join the claim, selected by entry date',
  })
  preview(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.claimsService.previewPeriod(
      company.id,
      user.id,
      periodStart,
      periodEnd,
    );
  }

  @Post()
  @Permissions('expense:entry')
  @ApiOperation({
    summary: 'Submit a claim for a given range of entry dates',
  })
  submit(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitClaimDto,
  ) {
    return this.claimsService.submit(company.id, user.id, dto);
  }

  @Get('mine')
  @Permissions('expense:entry', 'expense:view')
  listMine(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.claimsService.listMine(company.id, user.id);
  }

  @Get('pending-approval')
  @Permissions('expense:approve', 'expense:accrue', 'expense:post')
  @ApiOperation({ summary: 'Claims waiting for your action' })
  listPending(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.claimsService.listPendingForUser(company.id, user.id);
  }

  @Get()
  @Permissions('expense:view_all')
  @ApiOperation({ summary: 'All claims, filterable by status and amount' })
  listAll(
    @CurrentCompany() company: CompanyContext,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('minAmount') minAmount?: string,
  ) {
    return this.claimsService.listAll(company.id, {
      status,
      employeeId,
      minAmount: minAmount ? Number(minAmount) : undefined,
    });
  }

  @Get(':id')
  @Permissions('expense:entry', 'expense:view', 'expense:view_all')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claimsService.findOne(company.id, id);
  }

  @Post(':id/accrue')
  @Permissions('expense:accrue')
  @ApiOperation({ summary: 'Create the accrual journal and mark the claim' })
  accrue(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.claimsService.accrue(company.id, user.id, id, dto.remark);
  }

  @Post(':id/review')
  @Permissions('expense:approve')
  review(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.claimsService.review(company.id, user.id, id, dto.remark);
  }

  @Post(':id/approve')
  @Permissions('expense:approve')
  approve(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.claimsService.approve(company.id, user.id, id, dto.remark);
  }

  @Post(':id/post')
  @Permissions('expense:post')
  @ApiOperation({
    summary:
      'Create the journal that reverses the accrual and records the payment',
  })
  postClaim(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.claimsService.post(company.id, user.id, id, dto.remark);
  }

  @Post(':id/request-revision')
  @Permissions('expense:approve', 'expense:accrue')
  @ApiOperation({
    summary: 'Send the claim back to the claimant for correction',
  })
  requestRevision(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.claimsService.requestRevision(
      company.id,
      user.id,
      id,
      dto.remark,
    );
  }

  @Post(':id/resubmit')
  @Permissions('expense:entry')
  resubmit(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claimsService.resubmit(company.id, user.id, id);
  }

  @Delete(':id')
  @Roles('ADMINISTRATOR')
  @ApiOperation({
    summary:
      'Delete the claim and the whole expense footprint of its submitter. Administrators only.',
  })
  remove(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.claimsService.deleteClaimAndSubmitterData(company.id, id);
  }
}
