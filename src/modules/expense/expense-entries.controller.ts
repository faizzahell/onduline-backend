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
  StreamableFile,
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
  CreateExpenseEntryDto,
  ReviseEntryAmountDto,
  UpdateExpenseEntryDto,
} from './dto/expense-entry.dto';
import { ExpenseEntriesService } from './expense-entries.service';
import {
  MAX_RECEIPT_FILES,
  receiptUploadOptions,
} from './expense-upload.config';

@ApiTags('Expense Entries')
@ApiBearerAuth()
@Controller('expense/entries')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class ExpenseEntriesController {
  constructor(private readonly entriesService: ExpenseEntriesService) {}

  @Get()
  @Permissions('expense:entry', 'expense:view')
  @ApiOperation({
    summary: 'Expense entries of the currently signed-in employee',
  })
  listMine(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('unclaimedOnly', new ParseBoolPipe({ optional: true }))
    unclaimedOnly?: boolean,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.entriesService.listMine(company.id, user.id, {
      unclaimedOnly,
      from,
      to,
    });
  }

  @Post()
  @Permissions('expense:entry')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Record one expense entry together with its attachments in a single transaction',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_RECEIPT_FILES, receiptUploadOptions),
  )
  create(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseEntryDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.entriesService.create(company.id, user.id, dto, files ?? []);
  }

  @Get(':id')
  @Permissions('expense:entry', 'expense:view', 'expense:view_all')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entriesService.findOne(company.id, id);
  }

  @Put(':id')
  @Permissions('expense:entry')
  @ApiOperation({
    summary: 'Edit an unclaimed entry: category, date, amount, and details',
  })
  update(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseEntryDto,
  ) {
    return this.entriesService.update(company.id, user.id, id, dto);
  }

  @Put(':id/verify')
  @Permissions('expense:entry')
  @ApiOperation({
    summary:
      'Mark a reviewed entry as verified and ready to claim. Fails if the line is still missing required fields or proof.',
  })
  verify(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entriesService.verify(company.id, user.id, id);
  }

  @Put(':id/unverify')
  @Permissions('expense:entry')
  @ApiOperation({
    summary: 'Send a verified entry back to draft so it can be reworked',
  })
  unverify(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entriesService.unverify(company.id, user.id, id);
  }

  @Post(':id/attachments')
  @Permissions('expense:entry')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add proof photos to an existing entry' })
  @UseInterceptors(
    FilesInterceptor('files', MAX_RECEIPT_FILES, receiptUploadOptions),
  )
  addAttachments(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.entriesService.addAttachments(
      company.id,
      user.id,
      id,
      files ?? [],
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @Permissions('expense:entry')
  removeAttachment(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.entriesService.removeAttachment(
      company.id,
      user.id,
      id,
      attachmentId,
    );
  }

  @Get('attachments/:attachmentId/download')
  @Permissions('expense:entry', 'expense:view', 'expense:view_all')
  @ApiOperation({ summary: 'Download a proof attachment' })
  async downloadAttachment(
    @CurrentCompany() company: CompanyContext,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    const { attachment, stream } =
      await this.entriesService.getAttachmentForDownload(
        company.id,
        attachmentId,
      );

    return new StreamableFile(stream, {
      type: attachment.mimeType,
      disposition: `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
      length: attachment.size,
    });
  }

  @Put(':id/revise')
  @Permissions('expense:approve')
  @ApiOperation({
    summary:
      'Revise the amount of an entry. A rejection is a revision, not an outright refusal.',
  })
  reviseAmount(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseEntryAmountDto,
  ) {
    return this.entriesService.reviseAmount(company.id, user.id, id, dto);
  }

  @Delete(':id')
  @Permissions('expense:entry')
  remove(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entriesService.remove(company.id, user.id, id);
  }
}
