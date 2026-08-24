import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RenewManagedDto {
  @ApiProperty({ description: 'Entity to renew a managed certificate for' })
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;

  @ApiPropertyOptional({ description: 'Revoke the entity\'s current active managed cert(s) after issuing the new one (rotation)', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  revokePrevious?: boolean;
}
