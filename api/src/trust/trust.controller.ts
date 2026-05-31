import { Controller, Get, Header, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { TrustService } from './trust.service';

// All endpoints here are PUBLIC by design — trust anchors, CRLs and certificate
// status must be reachable by any relying party with no authentication.
@ApiTags('trust')
@Controller('v1')
export class TrustController {
  constructor(private readonly svc: TrustService) {}

  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Download the CA certificate chain (trust anchor)' })
  @Header('Content-Type', 'application/x-pem-file')
  @Get('ca/chain')
  caChain(): string {
    return this.svc.getCaChain();
  }

  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Download the current certificate revocation list (CRL)' })
  @Header('Content-Type', 'application/x-pem-file')
  @Get('crl.pem')
  crl(): Promise<string> {
    return this.svc.generateCrl();
  }

  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Certificate status by serial (GOOD / REVOKED / EXPIRED / UNKNOWN)' })
  @Get('certificates/:serial/status')
  status(@Param('serial') serial: string) {
    return this.svc.certificateStatus(serial);
  }
}
