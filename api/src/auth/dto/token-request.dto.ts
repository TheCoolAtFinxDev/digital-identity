import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class TokenRequestDto {
  @ApiPropertyOptional({ description: 'OAuth2 grant type', default: 'client_credentials' })
  @IsOptional()
  @IsIn(['client_credentials'])
  grant_type?: string;

  @ApiProperty({ description: 'Service account client ID' })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({ description: 'Service account client secret' })
  @IsString()
  @IsNotEmpty()
  clientSecret!: string;
}
