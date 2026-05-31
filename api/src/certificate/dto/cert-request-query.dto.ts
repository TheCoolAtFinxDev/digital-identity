import { ApiPropertyOptional } from '@nestjs/swagger';

export class CertRequestQueryDto {
  @ApiPropertyOptional({ enum: ['NEW', 'ISSUED', 'REJECTED'], description: 'Filter by status' })
  status?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  page?: string;

  @ApiPropertyOptional({ description: 'Results per page (max 100)', example: 20 })
  limit?: string;
}
