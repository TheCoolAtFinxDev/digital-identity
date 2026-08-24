import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateOrgUnitDto {
  @ApiProperty({ description: 'The verified ORGANISATION entity this structure belongs to' })
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;

  @ApiProperty({ enum: ['ORGANISATION', 'DIVISION', 'DEPARTMENT'] })
  @IsIn(['ORGANISATION', 'DIVISION', 'DEPARTMENT'])
  unitType!: 'ORGANISATION' | 'DIVISION' | 'DEPARTMENT';

  @ApiProperty({ example: 'Finance' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Short label used on the stamp, e.g. FIN', example: 'FIN' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @ApiPropertyOptional({ description: 'Parent unit. Required for every unit except the root.' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'parentId must be a valid UUID' })
  parentId?: string;

  @ApiPropertyOptional({ description: 'User who heads this unit (HOD, division head)' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'headUserId must be a valid UUID' })
  headUserId?: string;
}
