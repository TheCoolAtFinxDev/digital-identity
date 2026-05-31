import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateOrgProfileDto {
  @ApiProperty({ example: 'Econet Telecom Lesotho (Pty) Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Econet Lesotho' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  tradingName?: string;

  @ApiProperty({ example: 'LS/2001/123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  registrationNumber!: string;

  @ApiPropertyOptional({ example: '2001-03-15' })
  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  @ApiProperty({ example: 'LS', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  registrationCountry!: string;

  @ApiProperty({ enum: BusinessType })
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @ApiPropertyOptional({ example: 'Telecommunications' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  industrySector?: string;

  @ApiPropertyOptional({ example: 'LS123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxNumber?: string;

  @ApiPropertyOptional({ example: 'LS-VAT-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vatNumber?: string;

  @ApiProperty({ example: '7 Griffith Road, Maseru' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  regAddressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  regAddressLine2?: string;

  @ApiProperty({ example: 'Maseru' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  regCity!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  regRegion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  regPostalCode?: string;

  @ApiProperty({ example: 'LS', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  regCountry!: string;

  @ApiPropertyOptional({ example: 'info@econet.co.ls' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+26622123456' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'https://www.econet.co.ls' })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;
}
