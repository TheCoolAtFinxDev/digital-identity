import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SetHeadDto {
  @ApiPropertyOptional({
    description: 'User to appoint as head. Omit or send null to leave the seat vacant.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'headUserId must be a valid UUID' })
  headUserId?: string | null;
}
