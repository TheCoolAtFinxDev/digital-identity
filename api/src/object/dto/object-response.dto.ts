import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export class ObjectResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: ['DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET'],
  })
  objectType!: string;
  @ApiProperty() reference!: string;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiPropertyOptional({
    description: 'Name of the issuing entity, if linked',
  })
  entityName?: string | null;
  @ApiPropertyOptional() metadata?: Record<string, unknown> | null;
  @ApiProperty() createdAt!: Date;
}

export class ObjectQueryDto {
  @ApiPropertyOptional({ enum: ['DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET'] })
  objectType?: string;
  @ApiPropertyOptional() entityId?: string;
  @ApiPropertyOptional() page?: string;
  @ApiPropertyOptional() limit?: string;
}

export class ObjectPageDto {
  @ApiProperty({ type: [ObjectResponseDto] }) data!: ObjectResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
