import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class IssueManagedDto {
  @ApiProperty({ description: 'Entity to issue a managed (HSM-escrow) certificate for', example: '5be4d9ef-2912-4090-aaea-d24553653ff7' })
  @IsString()
  @Matches(UUID_RE, { message: 'entityId must be a valid UUID' })
  entityId!: string;
}
