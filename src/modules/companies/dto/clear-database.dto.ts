import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, ValidateIf } from 'class-validator';

export type ClearScope = 'all' | 'company';

export class ClearDatabaseDto {
  @ApiProperty({ enum: ['all', 'company'] })
  @IsIn(['all', 'company'])
  scope: ClearScope;

  /** Required when scope is `company`: which company's data to wipe. */
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto: ClearDatabaseDto) => dto.scope === 'company')
  @IsUUID('4')
  companyId?: string;

  /**
   * A guard so the destructive call cannot be made by accident; the client
   * must echo the exact confirmation phrase.
   */
  @ApiProperty({ example: 'CLEAR' })
  @IsString()
  confirm: string;
}
