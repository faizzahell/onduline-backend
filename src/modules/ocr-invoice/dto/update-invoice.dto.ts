import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO4217CurrencyCode,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 'PCS' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lineTotal?: number;
}

/**
 * Every field is optional and treated as a true PATCH: fields that are not
 * sent are left as they are. Send `lines` only when you really intend to
 * replace all line items.
 */
export class UpdateInvoiceDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({ example: '2026-10-25' })
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ example: '2026-11-25' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'IDR' })
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional({ type: [InvoiceLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
}

/** Statuses a reviewer may set manually. */
export enum TargetValidationStatus {
  VALIDATED = 'VALIDATED',
  MATCHED = 'MATCHED',
}

export class ValidateInvoiceDto {
  @ApiPropertyOptional({ enum: TargetValidationStatus })
  @IsEnum(TargetValidationStatus, {
    message: 'Status must be either VALIDATED or MATCHED',
  })
  status: TargetValidationStatus;
}
