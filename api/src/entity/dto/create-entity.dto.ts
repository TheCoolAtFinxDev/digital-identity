import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CreateEntityDto {
  @ApiProperty({ description: 'Legal name of the entity', example: 'Econet Telecom Lesotho' })
  @IsString()
  @MinLength(2)
  @MaxLength(256)
  name!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code', example: 'LS' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiPropertyOptional({ enum: EntityType, default: 'ORGANISATION' })
  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;
}
