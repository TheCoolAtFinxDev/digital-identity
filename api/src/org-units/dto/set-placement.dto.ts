import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a person sits on the org chart. Every field is optional and independently
 * clearable with null — people move department, change manager, and occasionally
 * have their personal identity re-linked after a KYC correction.
 */
export class SetPlacementDto {
  @ApiPropertyOptional({ description: 'Unit the person works in', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(UUID_RE, { message: 'orgUnitId must be a valid UUID' })
  orgUnitId?: string | null;

  @ApiPropertyOptional({ description: 'Line manager — the first pair of eyes on a stamp request', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(UUID_RE, { message: 'managerId must be a valid UUID' })
  managerId?: string | null;

  @ApiPropertyOptional({
    description: 'Verified PERSON entity behind this login. Required before the person can hold a personal signing key.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(UUID_RE, { message: 'personEntityId must be a valid UUID' })
  personEntityId?: string | null;
}
