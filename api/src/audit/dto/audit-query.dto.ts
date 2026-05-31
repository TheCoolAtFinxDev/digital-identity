import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by event type', example: 'CERTIFICATE_ISSUED' })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ description: 'Filter by certificate request ID' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'requestId must be a valid UUID' })
  requestId?: string;

  @ApiPropertyOptional({ description: 'Filter by entity ID' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 start date (inclusive)', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end date (inclusive)', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Results per page (max 100)', example: 20 })
  @IsOptional()
  @IsString()
  limit?: string;
}
