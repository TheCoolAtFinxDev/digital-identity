import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ description: 'Bearer token to include in the Authorization header' })
  accessToken!: string;

  @ApiProperty({ description: 'Token lifetime in seconds', example: 86400 })
  expiresIn!: number;
}
