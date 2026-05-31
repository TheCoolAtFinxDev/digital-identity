import { ApiPropertyOptional } from '@nestjs/swagger';
import { RelationshipStatus, RelationshipType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RelationshipQueryDto {
  @ApiPropertyOptional({ enum: RelationshipStatus })
  @IsOptional()
  @IsEnum(RelationshipStatus)
  status?: RelationshipStatus;

  @ApiPropertyOptional({ enum: RelationshipType })
  @IsOptional()
  @IsEnum(RelationshipType)
  relationshipType?: RelationshipType;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class EntityRelationshipsQueryDto extends RelationshipQueryDto {
  @ApiPropertyOptional({
    enum: ['subject', 'object', 'both'],
    default: 'both',
    description: 'Filter by role of the entity in the relationship',
  })
  @IsOptional()
  @IsEnum(['subject', 'object', 'both'])
  direction?: 'subject' | 'object' | 'both' = 'both';
}
