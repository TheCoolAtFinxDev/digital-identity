import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CertListQueryDto {
  @ApiPropertyOptional({ description: 'Filter to certificates issued for this entity' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId?: string;

  @ApiPropertyOptional({ description: 'Limit to certificates held by one organisational unit' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'orgUnitId must be a valid UUID' })
  orgUnitId?: string;

  @ApiPropertyOptional({ description: 'Only certificates expiring within this many days (not yet expired, not revoked)' })
  @IsOptional()
  // Guard the parse: an absent query param must stay undefined, not become NaN.
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : parseInt(value)))
  @IsInt()
  @Min(1)
  @Max(3650)
  expiringInDays?: number;

  @ApiPropertyOptional({ description: 'Include revoked certificates (default true)', default: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeRevoked?: boolean;
}
