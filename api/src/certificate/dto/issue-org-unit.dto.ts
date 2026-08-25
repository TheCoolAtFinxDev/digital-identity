import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class IssueOrgUnitCertDto {
  @ApiProperty({
    description:
      "Organisational unit to issue a managed (HSM-escrow) signing key for. This is the key the unit's stamp is signed with.",
  })
  @IsString()
  @Matches(UUID_RE, { message: 'orgUnitId must be a valid UUID' })
  orgUnitId!: string;
}
