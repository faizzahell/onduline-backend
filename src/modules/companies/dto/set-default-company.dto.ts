import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetDefaultCompanyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  companyId: string;
}
