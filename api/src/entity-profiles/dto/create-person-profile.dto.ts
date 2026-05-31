import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PersonIdType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePersonProfileDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Michael' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  middleName?: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  lastName!: string;

  @ApiProperty({ example: '1985-06-15', description: 'ISO 8601 date (YYYY-MM-DD)' })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({ example: 'LS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nationality!: string;

  @ApiProperty({ enum: PersonIdType })
  @IsEnum(PersonIdType)
  idType!: PersonIdType;

  @ApiProperty({ example: 'A12345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  idNumber!: string;

  @ApiPropertyOptional({ example: 'Government of Lesotho' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idIssuedBy?: string;

  @ApiPropertyOptional({ example: '2015-01-01' })
  @IsOptional()
  @IsDateString()
  idIssuedDate?: string;

  @ApiPropertyOptional({ example: '2030-01-01' })
  @IsOptional()
  @IsDateString()
  idExpiryDate?: string;

  @ApiPropertyOptional({ example: 'M1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxNumber?: string;

  @ApiProperty({ example: '123 Kingsway Road' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  addressLine2?: string;

  @ApiProperty({ example: 'Maseru' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  city!: string;

  @ApiPropertyOptional({ example: 'Maseru District' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  region?: string;

  @ApiPropertyOptional({ example: '100' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string;

  @ApiProperty({ example: 'LS', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  addressCountry!: string;
}
