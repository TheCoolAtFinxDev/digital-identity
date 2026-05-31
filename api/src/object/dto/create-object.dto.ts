import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const OBJECT_TYPES = ['DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET'] as const;

export class CreateObjectDto {
  @ApiProperty({ description: 'Type of digital object', enum: OBJECT_TYPES, example: 'DOCUMENT' })
  @IsIn(OBJECT_TYPES)
  objectType!: string;

  @ApiProperty({ description: 'External reference identifier', example: 'INV-2026-000123' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  reference!: string;

  @ApiPropertyOptional({ description: 'ID of the entity that owns this object' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Arbitrary key-value metadata', example: { amount: 1500 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
