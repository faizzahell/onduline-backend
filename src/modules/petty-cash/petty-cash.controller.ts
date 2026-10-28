import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import {
  ApprovalActionDto,
  RequestRevisionDto,
} from '../expense/dto/expense-claim.dto';
import {
  MAX_RECEIPT_FILES,
  receiptUploadOptions,
} from '../expense/expense-upload.config';
import {
  CreatePettyCashBatchDto,
  UpdatePettyCashBatchDto,
} from './dto/petty-cash.dto';
import { PettyCashService } from './petty-cash.service';

@ApiTags('Petty Cash')
@ApiBearerAuth()
@Controller('petty-cash/batches')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class PettyCashController {
  constructor(private readonly pettyCashService: PettyCashService) {}

  @Get()
  @Permissions('pettycash:entry', 'pettycash:approve', 'expense:view_all')
  list(
    @CurrentCompany() company: CompanyContext,
    @Query('status') status?: string,
  ) {
    return this.pettyCashService.list(company.id, status);
  }

  @Post()
  @Permissions('pettycash:entry')
  @ApiOperation({ summary: 'Create a petty cash batch with bulk entry' })
  create(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePettyCashBatchDto,
  ) {
    return this.pettyCashService.create(company.id, user.id, dto);
  }

  @Get(':id')
  @Permissions('pettycash:entry', 'pettycash:approve', 'expense:view_all')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pettyCashService.findOne(company.id, id);
  }

  @Put(':id')
  @Permissions('pettycash:entry')
  update(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePettyCashBatchDto,
  ) {
    return this.pettyCashService.update(company.id, id, dto);
  }

  @Post(':id/entries/:entryId/attachments')
  @Permissions('pettycash:entry')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_RECEIPT_FILES, receiptUploadOptions),
  )
  addEntryAttachments(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.pettyCashService.addEntryAttachments(
      company.id,
      id,
      entryId,
      files ?? [],
    );
  }

  @Post(':id/submit')
  @Permissions('pettycash:entry')
  submit(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pettyCashService.submit(company.id, user.id, id);
  }

  @Post(':id/approve')
  @Permissions('pettycash:approve')
  approve(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.pettyCashService.approve(company.id, user.id, id, dto.remark);
  }

  @Post(':id/request-revision')
  @Permissions('pettycash:approve')
  requestRevision(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.pettyCashService.requestRevision(
      company.id,
      user.id,
      id,
      dto.remark,
    );
  }

  @Post(':id/post')
  @Permissions('pettycash:post')
  @ApiOperation({
    summary: 'Build the petty cash journal and close the batch',
  })
  postBatch(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.pettyCashService.post(company.id, user.id, id, dto.remark);
  }
}
