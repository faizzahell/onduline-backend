import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsISO4217CurrencyCode,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { InvoiceLineDto } from './update-invoice.dto';

/** An empty invoice container, used by the file upload flow. */
export class CreateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorTaxId?: string;

  @ApiPropertyOptional({ example: 'IDR', default: 'IDR' })
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}

/**
 * Invoice entry without OCR.
 *
 * The header and its lines are filled in by hand, so the invoice goes straight
 * to `EXTRACTED` status and enters the same review flow as an OCR result.
 */
export class CreateManualInvoiceDto extends CreateInvoiceDto {
  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  subtotal?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  taxAmount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  totalAmount?: number;

  @ApiPropertyOptional({ type: [InvoiceLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
}

/** Boolean values from a multipart form arrive as strings. */
const toBoolean = ({ value }: { value: unknown }): boolean =>
  value === true || value === 'true' || value === '1';

export class UploadInvoiceFileDto {
  @ApiPropertyOptional({
    description:
      'Runs OCR extraction after the file is stored. Only possible when OCR is enabled for this company.',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  runOcr?: boolean;
}
