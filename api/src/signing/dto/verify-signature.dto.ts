import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VerifySignatureDto {
  @ApiPropertyOptional({ description: 'Serial of the certificate whose key signed (preferred)' })
  @IsOptional()
  @IsString()
  certSerial?: string;

  @ApiPropertyOptional({ description: 'Entity ID — uses its latest active cert if certSerial omitted' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId?: string;

  @ApiProperty({ description: 'Base64-encoded original content that was signed' })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  payloadB64!: string;

  @ApiProperty({ description: 'Base64-encoded signature to verify' })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  signatureB64!: string;
}
