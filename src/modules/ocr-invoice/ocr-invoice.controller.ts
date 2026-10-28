import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
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
import { BindPoDto } from './dto/bind-po.dto';
import {
  CreateInvoiceDto,
  CreateManualInvoiceDto,
  UploadInvoiceFileDto,
} from './dto/create-invoice.dto';
import { UpdateInvoiceDto, ValidateInvoiceDto } from './dto/update-invoice.dto';
import { invoiceFileUploadOptions } from './invoice-upload.config';
import { OcrInvoiceService } from './ocr-invoice.service';

/** Allowed to view invoices: both the AP team and the warehouse. */
const VIEW_PERMISSIONS = ['ocr:view', 'ocr:grn_view'] as const;

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('ocr/invoices')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class OcrInvoiceController {
  constructor(private readonly invoiceService: OcrInvoiceService) {}

  @Post()
  @Permissions('ocr:upload')
  @ApiOperation({ summary: 'Create an empty invoice as an upload container' })
  create(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoiceService.create(company.id, user.id, dto);
  }

  @Post('manual')
  @Permissions('ocr:upload')
  @ApiOperation({
    summary:
      'Record an invoice and its lines manually, without going through OCR',
  })
  createManual(
    @CurrentCompany() company: CompanyContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualInvoiceDto,
  ) {
    return this.invoiceService.createManual(company.id, user.id, dto);
  }

  @Post(':id/files')
  @Permissions('ocr:upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        runOcr: {
          type: 'boolean',
          description:
            'Run OCR extraction. Only applies when OCR is enabled for this company.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload an invoice file, with OCR as an option rather than a requirement',
  })
  @UseInterceptors(FileInterceptor('file', invoiceFileUploadOptions))
  uploadFile(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @Body() dto: UploadInvoiceFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    return this.invoiceService.uploadFile(
      company,
      invoiceId,
      file,
      dto.runOcr ?? false,
    );
  }

  @Get()
  @Permissions(...VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'List invoices for the active company, newest first',
  })
  findAll(@CurrentCompany() company: CompanyContext) {
    return this.invoiceService.findAll(company.id);
  }

  @Get(':id/jobs')
  @Permissions('ocr:view')
  @ApiOperation({ summary: 'OCR job history for an invoice' })
  getOCRJobs(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.getOCRJobs(company.id, id);
  }

  @Get(':id/po-candidates')
  @Permissions('ocr:resolve_po', 'ocr:match')
  @ApiOperation({
    summary: 'Matching open purchase orders, sorted by highest score',
  })
  findPurchaseOrderCandidates(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.findPurchaseOrderCandidates(company.id, id);
  }

  @Get(':id/files/:fileId/download')
  @Permissions(...VIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Download the original invoice file' })
  async downloadFile(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<StreamableFile> {
    const { file, stream } = await this.invoiceService.getFileForDownload(
      company.id,
      id,
      fileId,
    );

    return new StreamableFile(stream, {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
      length: file.size,
    });
  }

  @Get(':id')
  @Permissions(...VIEW_PERMISSIONS)
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.findOne(company.id, id);
  }

  @Patch(':id')
  @Permissions('ocr:upload', 'ocr:review')
  @ApiOperation({ summary: 'Correct or fill in invoice data' })
  update(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoiceService.update(company.id, id, dto);
  }

  @Post(':id/bind-po')
  @Permissions('ocr:resolve_po')
  @ApiOperation({ summary: 'Link an invoice to a purchase order' })
  bindPurchaseOrder(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BindPoDto,
  ) {
    return this.invoiceService.bindPurchaseOrder(company.id, id, dto);
  }

  @Put(':id/validate')
  @Permissions('ocr:review', 'ocr:match')
  @ApiOperation({ summary: 'Set the status to VALIDATED or MATCHED' })
  validate(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateInvoiceDto,
  ) {
    return this.invoiceService.validateInvoice(company.id, id, user.id, dto);
  }

  @Post(':id/submit-bc')
  @Permissions('ocr:submit_bc')
  @ApiOperation({
    summary: 'Submit a MATCHED invoice to Business Central',
  })
  submitToBusinessCentral(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.submitToBusinessCentral(company.id, id);
  }

  @Delete(':id')
  @Permissions('ocr:upload')
  remove(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.remove(company.id, id);
  }
}
