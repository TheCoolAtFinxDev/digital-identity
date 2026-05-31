import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeCertDto {
  @ApiPropertyOptional({ description: 'Operator name or system identifier performing the revocation', example: 'admin' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  revokedBy?: string;
}
