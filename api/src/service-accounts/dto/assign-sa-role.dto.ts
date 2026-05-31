import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleScope } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AssignSaRoleDto {
  @ApiProperty({ example: '00000000-0000-0000-0001-000000000005' })
  @IsString()
  @Matches(UUID_RE, { message: 'roleId must be a valid UUID' })
  roleId!: string;

  @ApiPropertyOptional({ enum: RoleScope, default: 'GLOBAL' })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeId?: string;
}
