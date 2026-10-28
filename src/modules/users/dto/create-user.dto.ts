import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'purchaser@ofda.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds: string[];

  /**
   * The company the new account is granted. A super administrator must choose
   * it; for a plain administrator it is ignored and forced to their own active
   * company.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  companyId?: string;
}
