import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BindPoDto {
  @ApiProperty({ example: 'PO-10495' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  poNumber: string;
}
