import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CasePriority, VerificationCaseType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateCaseDto {
  @ApiProperty({ example: '3afcf80c-20d3-4908-bdf9-0acd3064ac0b' })
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;

  @ApiProperty({ enum: VerificationCaseType })
  @IsEnum(VerificationCaseType)
  caseType!: VerificationCaseType;

  @ApiPropertyOptional({ enum: CasePriority, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Due date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
