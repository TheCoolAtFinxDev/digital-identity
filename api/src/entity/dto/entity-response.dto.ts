import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EntityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) kycStatus!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ description: 'Number of certificate requests linked to this entity' })
  requestCount!: number;
}

export class EntityQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) kycStatus?: string;
  @ApiPropertyOptional() page?: string;
  @ApiPropertyOptional() limit?: string;
}

export class EntityPageDto {
  @ApiProperty({ type: [EntityResponseDto] }) data!: EntityResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
