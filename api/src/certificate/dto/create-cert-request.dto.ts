import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const PROFILES = ['usr_entity_cert', 'usr_cert'] as const;

export class CreateCertRequestDto {
  @ApiProperty({
    description: 'PEM-encoded certificate signing request',
    example: '-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----',
  })
  @IsString()
  @MinLength(50)
  @MaxLength(16384)
  csrPem!: string;

  @ApiPropertyOptional({
    description: 'Certificate profile to apply',
    enum: PROFILES,
    default: 'usr_entity_cert',
  })
  @IsOptional()
  @IsIn(PROFILES)
  profile?: string;

  @ApiPropertyOptional({
    description: 'Entity ID — required when profile is usr_entity_cert',
  })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
