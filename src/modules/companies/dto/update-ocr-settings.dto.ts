import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Per-company OCR switches.
 *
 * OCR is optional: while it is off, invoices and expense lines can still be
 * recorded manually. Only a super administrator may change these.
 */
export class UpdateOcrSettingsDto {
  @ApiPropertyOptional({
    description: 'Enables automatic extraction for invoice uploads',
  })
  @IsOptional()
  @IsBoolean()
  ocrInvoiceEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enables receipt scanning while recording expenses',
  })
  @IsOptional()
  @IsBoolean()
  ocrExpenseEnabled?: boolean;
}
