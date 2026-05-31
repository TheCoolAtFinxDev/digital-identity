import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RelationshipType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateRelationshipDto {
  @ApiProperty({ example: '3afcf80c-20d3-4908-bdf9-0acd3064ac0b', description: 'Subject entity ID' })
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_RE, { message: 'subjectEntityId must be a valid UUID' })
  subjectEntityId!: string;

  @ApiProperty({ example: '8f2e93ca-0e0f-4bad-a7bb-1dcc17f1bb02', description: 'Object entity ID' })
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_RE, { message: 'objectEntityId must be a valid UUID' })
  objectEntityId!: string;

  @ApiProperty({ enum: RelationshipType })
  @IsEnum(RelationshipType)
  relationshipType!: RelationshipType;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Relationship start date (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2030-12-31', description: 'Relationship end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 25.5,
    description: 'Ownership percentage — only valid for SHAREHOLDER_OF and BENEFICIAL_OWNER_OF',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(100)
  ownershipPercent?: number;

  @ApiPropertyOptional({ example: 'Hired on probation' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
