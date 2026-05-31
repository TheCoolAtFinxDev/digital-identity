import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CertificateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() serial!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() profile!: string;
  @ApiPropertyOptional() issuer?: string | null;
  @ApiPropertyOptional() fingerprint?: string | null;
  @ApiProperty() validFrom!: Date;
  @ApiProperty() validTo!: Date;
  @ApiProperty() isRevoked!: boolean;
  @ApiPropertyOptional() revokedAt?: Date | null;
  @ApiPropertyOptional() revokedBy?: string | null;
  @ApiProperty() certPem!: string;
  @ApiProperty() createdAt!: Date;
}

export class CertRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['NEW', 'ISSUED', 'REJECTED'] }) status!: string;
  @ApiPropertyOptional() subject?: string | null;
  @ApiPropertyOptional() keyBits?: number | null;
  @ApiProperty() profile!: string;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: () => CertificateResponseDto })
  certificate?: CertificateResponseDto;
}

class CertificateSummaryDto {
  @ApiProperty() serial!: string;
}

export class CertRequestSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['NEW', 'ISSUED', 'REJECTED'] }) status!: string;
  @ApiPropertyOptional() subject?: string | null;
  @ApiProperty() profile!: string;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: () => CertificateSummaryDto }) certificate?: CertificateSummaryDto | null;
}

export class CertRequestPageDto {
  @ApiProperty({ type: [CertRequestSummaryDto] }) data!: CertRequestSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
