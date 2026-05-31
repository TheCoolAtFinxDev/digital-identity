import { ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationCaseStatus, VerificationCaseType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId?: string;

  @ApiPropertyOptional({ enum: VerificationCaseStatus })
  @IsOptional()
  @IsEnum(VerificationCaseStatus)
  status?: VerificationCaseStatus;

  @ApiPropertyOptional({ enum: VerificationCaseType })
  @IsOptional()
  @IsEnum(VerificationCaseType)
  caseType?: VerificationCaseType;

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
