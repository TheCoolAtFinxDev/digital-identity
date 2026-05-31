import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const KYC_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export class UpdateKycStatusDto {
  @ApiProperty({ description: 'New KYC status', enum: KYC_STATUSES })
  @IsIn(KYC_STATUSES)
  kycStatus!: 'PENDING' | 'APPROVED' | 'REJECTED';
}
