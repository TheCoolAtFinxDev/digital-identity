import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  username!: string;

  @ApiProperty({ example: 'change_me_admin_password' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
