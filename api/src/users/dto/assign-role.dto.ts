import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleScope } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: '00000000-0000-0000-0001-000000000002' })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'roleId must be a UUID',
  })
  roleId!: string;

  @ApiPropertyOptional({ enum: RoleScope, default: 'GLOBAL' })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;

  @ApiPropertyOptional({ description: 'Entity or organisation ID for scoped assignments' })
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
