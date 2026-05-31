import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerificationEntityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) kycStatus!: string;
}

export class VerificationResponseDto {
  @ApiProperty({ description: 'Whether the certificate is currently valid' })
  valid!: boolean;

  @ApiProperty() serial!: string;
  @ApiProperty() subject!: string;
  @ApiPropertyOptional() issuer?: string | null;

  @ApiProperty({
    description: 'Certificate profile',
    enum: ['usr_entity_cert', 'usr_cert'],
  })
  profile!: string;

  @ApiProperty({
    description: 'Derived identity type',
    enum: ['ENTITY', 'OBJECT'],
  })
  identityType!: string;

  @ApiProperty() validFrom!: Date;
  @ApiProperty() validTo!: Date;

  @ApiProperty({ description: 'True if the certificate has passed its expiry date' })
  isExpired!: boolean;

  @ApiProperty({ description: 'True if the certificate has been revoked' })
  isRevoked!: boolean;

  @ApiPropertyOptional({
    description: 'Issuing entity details, present for usr_entity_cert certificates',
    type: () => VerificationEntityDto,
  })
  entity?: VerificationEntityDto | null;

  @ApiProperty({ description: 'Timestamp of this verification check' })
  checkedAt!: Date;
}
