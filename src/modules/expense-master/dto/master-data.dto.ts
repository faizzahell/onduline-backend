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

export enum EmployeeLevelDto {
  STAFF = 'STAFF',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
}

export enum EmployeeDivisionDto {
  SALES = 'SALES',
  NON_SALES = 'NON_SALES',
}

/** Shared by department, area code, sales area, and marketing code. */
export class UpsertDimensionDto {
  @ApiProperty({ example: 'RM01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  headEmployeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  managerEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertExpenseCategoryDto {
  @ApiProperty({ example: 'GASOLINE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;

  @ApiProperty({ example: 'Gasoline / Petrol' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent category' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({
    example: '60005051',
    description: 'BC G/L account number, attached to the subcategory',
  })
  @IsOptional()
  @IsString()
  glAccountNo?: string;

  @ApiPropertyOptional({ example: 'Gasoline/Petrol' })
  @IsOptional()
  @IsString()
  glAccountName?: string;

  @ApiPropertyOptional({ example: 'PC5' })
  @IsOptional()
  @IsString()
  pettyCashCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresProof?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresMarketingCode?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresDestination?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFixedRate?: boolean;

  @ApiPropertyOptional({
    description: 'Amounts above this need per-transaction approval',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  perTransactionApprovalThreshold?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isEntertainment?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMealAllowance?: boolean;

  @ApiPropertyOptional({ example: 'DAY' })
  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  availableForExpense?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  availableForPettyCash?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateExpenseRateDto {
  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsISO8601()
  effectiveFrom: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}

export class UpsertEmployeeDto {
  @ApiProperty({ example: 'AKX', description: 'EMPLOYEE CODE dimension in BC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  employeeCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ enum: EmployeeLevelDto })
  @IsOptional()
  @IsEnum(EmployeeLevelDto)
  level?: EmployeeLevelDto;

  @ApiPropertyOptional({ enum: EmployeeDivisionDto })
  @IsOptional()
  @IsEnum(EmployeeDivisionDto)
  division?: EmployeeDivisionDto;

  @ApiPropertyOptional({
    description:
      'Posting location, the reference for the meal allowance distance rule',
  })
  @IsOptional()
  @IsString()
  homeBase?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The employee's login account",
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  areaCodeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  salesAreaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
