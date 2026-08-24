import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OrgUnitQueryDto {
  @ApiPropertyOptional({ description: 'Limit to one organisation' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId?: string;

  @ApiPropertyOptional({ enum: ['ORGANISATION', 'DIVISION', 'DEPARTMENT'] })
  @IsOptional()
  @IsIn(['ORGANISATION', 'DIVISION', 'DEPARTMENT'])
  unitType?: 'ORGANISATION' | 'DIVISION' | 'DEPARTMENT';

  @ApiPropertyOptional({ description: 'Return the units nested as a tree instead of a flat list', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  tree?: boolean;

  @ApiPropertyOptional({ description: 'Include deactivated units', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
