import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SignDto {
  @ApiProperty({ description: 'Entity whose HSM-held key signs', example: '5be4d9ef-2912-4090-aaea-d24553653ff7' })
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;

  @ApiProperty({ description: 'Base64-encoded content to sign (e.g. the document bytes)' })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  payloadB64!: string;

  @ApiPropertyOptional({ description: 'Human label for the signed artifact (e.g. invoice-123.pdf)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  documentName?: string;
}
