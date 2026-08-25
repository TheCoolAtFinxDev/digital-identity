import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OffboardDto {
  @ApiPropertyOptional({
    description:
      'Who takes over any unit this person heads. Required if they head an active unit, unless leaveSeatsVacant is set — a headless department cannot approve a stamp request.',
  })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'successorUserId must be a valid UUID' })
  successorUserId?: string;

  @ApiPropertyOptional({
    description:
      'Offboard anyway and leave the seats vacant. Deliberate, and it stops those units approving stamp requests until someone is appointed.',
    default: false,
  })
  @IsOptional()
  leaveSeatsVacant?: boolean;
}
