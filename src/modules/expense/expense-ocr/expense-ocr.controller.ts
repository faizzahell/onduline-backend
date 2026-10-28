import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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

import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { CompanyContext } from '../../../common/types/company-context';
import {
  MAX_RECEIPT_FILES,
  receiptUploadOptions,
} from '../expense-upload.config';
import { ExpenseOcrService } from './expense-ocr.service';

@ApiTags('Expense OCR')
@ApiBearerAuth()
@Controller('expense/ocr-jobs')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class ExpenseOcrController {
  constructor(private readonly ocrService: ExpenseOcrService) {}

  @Post()
  @Permissions('expense:entry')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload one or more receipts for extraction, one job per file. Requires expense OCR to be enabled for the company.',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_RECEIPT_FILES, receiptUploadOptions),
  )
  create(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one receipt file is required');
    }

    return this.ocrService.createMany(company, user.id, files);
  }

  @Get()
  @Permissions('expense:entry')
  @ApiOperation({ summary: 'Your extractions that have no entry yet' })
  listPending(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ocrService.listPending(company.id, user.id);
  }

  @Get(':id')
  @Permissions('expense:entry')
  @ApiOperation({ summary: 'Status and extracted values of one receipt' })
  findOne(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ocrService.findOne(company.id, user.id, id);
  }

  @Get(':id/file')
  @Permissions('expense:entry')
  @ApiOperation({ summary: 'Download the uploaded receipt' })
  async downloadFile(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { job, stream } = await this.ocrService.getFileForDownload(
      company.id,
      user.id,
      id,
    );

    return new StreamableFile(stream, {
      type: job.mimeType,
      disposition: `inline; filename="${encodeURIComponent(job.originalName)}"`,
      length: job.size,
    });
  }

  @Delete(':id')
  @Permissions('expense:entry')
  remove(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ocrService.remove(company.id, user.id, id);
  }
}
