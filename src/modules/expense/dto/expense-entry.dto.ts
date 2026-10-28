import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum EntertainmentKindDto {
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  COFFEE_BREAK = 'COFFEE_BREAK',
  GIFT = 'GIFT',
  FLOWER_ARRANGEMENT = 'FLOWER_ARRANGEMENT',
  OTHER = 'OTHER',
}

export enum BusinessRelationTypeDto {
  DISTRIBUTOR = 'DISTRIBUTOR',
  CUSTOMER = 'CUSTOMER',
  CONSULTANT = 'CONSULTANT',
  INTERNAL = 'INTERNAL',
  OTHER = 'OTHER',
}

/**
 * Expense entry payload.
 *
 * The fields are flat rather than nested because the endpoint accepts
 * `multipart/form-data`: attachments must be uploaded in the same request so
 * that an entry without proof is never stored.
 */
export class CreateExpenseEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ example: '2026-08-15', description: 'Date on the receipt' })
  @IsISO8601()
  expenseDate: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @ApiPropertyOptional({
    description:
      'Unit price. Ignored for fixed-rate categories such as meal allowance.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Travel destination' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for entertainment',
  })
  @IsOptional()
  @IsUUID('4')
  marketingCodeId?: string;

  @ApiPropertyOptional({
    description:
      'Skips the similarity check against existing entries, for genuine duplicate expenses.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowDuplicate?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Extraction job this entry comes from. Its receipt becomes the proof for this entry, so there is no need to upload the file twice.',
  })
  @IsOptional()
  @IsUUID('4')
  ocrJobId?: string;

  @ApiPropertyOptional({
    description:
      'Saves the entry as an incomplete draft, skipping the category requirement and proof checks. Used by the OCR flow so a receipt can be saved even before the missing fields (such as a destination) are filled in. A draft cannot be claimed until it is verified.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  saveAsDraft?: boolean;

  // --- Entertainment ------------------------------------------------------

  @ApiPropertyOptional({
    description: 'Merchant name, required for entertainment',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  entertainmentMerchantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entertainmentMerchantAddress?: string;

  @ApiPropertyOptional({ enum: EntertainmentKindDto })
  @IsOptional()
  @IsEnum(EntertainmentKindDto)
  entertainmentKind?: EntertainmentKindDto;

  @ApiPropertyOptional({ description: 'Name of the business relation hosted' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  entertainmentRelationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entertainmentRelationPosition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entertainmentRelationPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entertainmentRelationCompany?: string;

  @ApiPropertyOptional({ enum: BusinessRelationTypeDto })
  @IsOptional()
  @IsEnum(BusinessRelationTypeDto)
  entertainmentRelationBusinessType?: BusinessRelationTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entertainmentNotes?: string;

  // --- Meal allowance -----------------------------------------------------

  @ApiPropertyOptional({ example: '2026-08-11' })
  @IsOptional()
  @IsISO8601()
  mealStartDate?: string;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsISO8601()
  mealEndDate?: string;

  @ApiPropertyOptional({ description: 'Meal allowance travel destination' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mealDestination?: string;

  @ApiPropertyOptional({
    description: 'One-way distance from home base, in km',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mealOneWayDistanceKm?: number;
}

export class UpdateExpenseEntryDto extends CreateExpenseEntryDto {}

export class ReviseEntryAmountDto {
  @ApiProperty({ example: 250000, description: 'Approved amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  approvedAmount: number;

  @ApiProperty({ description: 'Reason for the revision, required' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remark: string;
}
