import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { VerificationService } from './verification.service';
import { VerificationResponseDto } from './dto/verification-response.dto';

@SkipThrottle()
@ApiTags('verification')
@Controller()
export class VerificationController {
  constructor(private readonly svc: VerificationService) {}

  @Public()
  @ApiOperation({
    summary: 'Verify a certificate by serial number (QR code target)',
    description: 'Public endpoint — no authentication required. Used by QR codes embedded in stamped documents.',
  })
  @ApiQuery({ name: 's', description: 'Certificate serial number', example: '1001' })
  @ApiOkResponse({ type: VerificationResponseDto })
  @Get('verify')
  verifyByQuery(@Query('s') serial: string) {
    return this.svc.verify(serial);
  }

  @Public()
  @ApiOperation({
    summary: 'Verify a certificate by serial number (API style)',
    description: 'Public endpoint — no authentication required.',
  })
  @ApiOkResponse({ type: VerificationResponseDto })
  @Get('v1/verify/:serial')
  verifyByPath(@Param('serial') serial: string) {
    return this.svc.verify(serial);
  }
}
