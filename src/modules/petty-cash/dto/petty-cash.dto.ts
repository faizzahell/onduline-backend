import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PettyCashEntryDto {
  @ApiProperty({ example: '2026-08-03' })
  @IsISO8601()
  expenseDate: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ example: 'Materai 100' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;

  @ApiProperty({ example: 1050000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'HO', description: 'AREA CODE dimension' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({
    example: 'ARI',
    description: 'EMPLOYEE CODE dimension',
  })
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiPropertyOptional({ example: 'COMMERCIAL' })
  @IsOptional()
  @IsString()
  departmentCode?: string;
}

/**
 * Bulk petty cash entry.
 *
 * A single batch carries many lines at once, mirroring the way the team works
 * today: fill in an Excel sheet, then copy it over into Business Central.
 */
export class CreatePettyCashBatchDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsISO8601()
  periodStart: string;

  @ApiProperty({ example: '2026-08-07' })
  @IsISO8601()
  periodEnd: string;

  @ApiProperty({ type: [PettyCashEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PettyCashEntryDto)
  entries: PettyCashEntryDto[];
}

export class UpdatePettyCashBatchDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-08-07' })
  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @ApiPropertyOptional({
    type: [PettyCashEntryDto],
    description: 'When provided, every line in the batch is replaced',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PettyCashEntryDto)
  entries?: PettyCashEntryDto[];
}
