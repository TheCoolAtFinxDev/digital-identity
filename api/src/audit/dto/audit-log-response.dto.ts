import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() event!: string;
  @ApiPropertyOptional() requestId?: string | null;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiPropertyOptional() detail?: unknown;
  @ApiProperty() createdAt!: Date;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogResponseDto] }) data!: AuditLogResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
