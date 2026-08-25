import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestSignaturesDto {
  @ApiProperty({ description: 'People to ask for a signature', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  signerIds!: string[];
}

export class ReasonDto {
  @ApiProperty({ description: 'Why — the other side reads this, so it has to say something' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class NoteDto {
  @ApiPropertyOptional({ description: 'Optional note to the requester' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SignDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateStampRequestDto {
  @ApiProperty({ description: 'Document to ask for a seal on' })
  @IsString()
  documentId!: string;
}
