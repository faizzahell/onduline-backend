import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'OI', description: 'Short unique code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Code may only contain letters, numbers, hyphen, and underscore',
  })
  code: string;

  @ApiProperty({ example: 'PT Onduline Indonesia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'IDR', default: 'IDR' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  journalInitials?: string;

  @ApiPropertyOptional({ example: 'RE' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  pettyCashJournalInitials?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  journalInitials?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  pettyCashJournalInitials?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
