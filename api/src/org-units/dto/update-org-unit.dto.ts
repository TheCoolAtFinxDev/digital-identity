import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @ApiPropertyOptional({ description: 'Move the unit under a different parent' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'parentId must be a valid UUID' })
  parentId?: string;
}
