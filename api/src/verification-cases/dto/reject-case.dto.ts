import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectCaseDto {
  @ApiProperty({ example: 'Submitted ID document is expired.', minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  rejectionReason!: string;
}
