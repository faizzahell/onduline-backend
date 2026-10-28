import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitClaimDto {
  @ApiProperty({
    example: '2026-08-21',
    description: 'Start of the period, compared against the entry date',
  })
  @IsISO8601()
  periodStart: string;

  @ApiProperty({ example: '2026-09-20' })
  @IsISO8601()
  periodEnd: string;
}

export class ApprovalActionDto {
  @ApiPropertyOptional({
    description: 'Optional note kept in the approval trail',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class RequestRevisionDto {
  @ApiProperty({ description: 'Reason for the revision, required' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remark: string;
}
