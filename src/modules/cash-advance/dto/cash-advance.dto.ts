import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum CashAdvanceTypeDto {
  /** Requested as the need arises, for example a specific trip. */
  CASE_BY_CASE = 'CASE_BY_CASE',
  /** Set for the whole year by HR, usually for field sales staff. */
  YEARLY = 'YEARLY',
}

export class CreateCashAdvanceDto {
  @ApiProperty({ enum: CashAdvanceTypeDto })
  @IsEnum(CashAdvanceTypeDto)
  type: CashAdvanceTypeDto;

  @ApiProperty({
    format: 'uuid',
    description:
      'The employee receiving the advance. HR requests on behalf of others.',
  })
  @IsUUID('4')
  employeeId: string;

  @ApiProperty({
    example: 7000000,
    description: 'Monthly amount for a yearly advance',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  periodYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;
}

export class SettleCashAdvanceDto {
  @ApiProperty({
    example: -2000000,
    description:
      'Positive means the company pays more, negative means the employee returns the difference.',
  })
  @Type(() => Number)
  @IsNumber()
  settlementAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class CashAdvanceActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class RejectCashAdvanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remark: string;
}
