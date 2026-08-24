import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateStampDto {
  @ApiProperty({ description: 'Entity whose HSM-held key stamps the document' })
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;

  @ApiPropertyOptional({ description: 'Label for the stamped artifact; defaults to the uploaded filename' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  documentName?: string;

  @ApiPropertyOptional({ description: 'ObjectRecord this artifact represents (invoice, licence, ticket, ...)' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'objectId must be a valid UUID' })
  objectId?: string;

  @ApiPropertyOptional({
    description: 'Render the visible seal + QR onto the PDF (default true). Non-PDF uploads are always signature-only.',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => !(value === 'false' || value === false))
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ description: 'Which page(s) carry the visible seal', enum: ['FIRST', 'LAST', 'ALL'], default: 'LAST' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['FIRST', 'LAST', 'ALL'])
  stampPage?: 'FIRST' | 'LAST' | 'ALL';
}
