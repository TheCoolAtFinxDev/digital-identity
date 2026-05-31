import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewCaseDto {
  @ApiProperty({ example: 'All documents verified. Identity confirmed.', minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reviewNotes!: string;
}
