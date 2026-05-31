import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceDocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadEvidenceDto {
  @ApiProperty({ enum: EvidenceDocumentType })
  @IsEnum(EvidenceDocumentType)
  documentType!: EvidenceDocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
