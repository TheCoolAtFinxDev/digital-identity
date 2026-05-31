import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CertificateService } from './certificate.service';
import { CertRequestPageDto, CertRequestResponseDto, CertificateResponseDto } from './dto/cert-response.dto';
import { CertRequestQueryDto } from './dto/cert-request-query.dto';
import { CreateCertRequestDto } from './dto/create-cert-request.dto';
import { IssueManagedDto } from './dto/issue-managed.dto';
import { RevokeCertDto } from './dto/revoke-cert.dto';
import { RequirePermission } from '../iam/permission.decorator';

@ApiBearerAuth()
@ApiTags('certificates')
@Controller('v1')
export class CertificateController {
  constructor(private readonly svc: CertificateService) {}

  @ApiOperation({ summary: 'List certificate requests (paginated)' })
  @ApiOkResponse({ type: CertRequestPageDto })
  @RequirePermission('cert:read')
  @Get('cert-requests')
  listRequests(@Query() q: CertRequestQueryDto) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));
    return this.svc.listRequests(page, limit, q.status);
  }

  @ApiOperation({ summary: 'Submit a new certificate signing request' })
  @ApiCreatedResponse({ type: CertRequestResponseDto })
  @RequirePermission('cert:request')
  @Post('cert-requests')
  createRequest(@Body() dto: CreateCertRequestDto, @Request() req: any) {
    return this.svc.createRequest(dto, req.user?.userId);
  }

  @ApiOperation({
    summary: 'Issue a managed (HSM-escrow) certificate for an approved entity',
    description: 'The CA generates the keypair inside the HSM and builds the CSR itself — no CSR is supplied. Requires cert:issue and the entity to be APPROVED.',
  })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  @HttpCode(201)
  @Post('cert-requests/managed')
  issueManaged(@Body() dto: IssueManagedDto, @Request() req: any) {
    // Scoped cert:issue resolution is performed inside the service because the
    // target entityId is part of the request body.
    return this.svc.issueManagedCertificate(dto.entityId, req.user.userId);
  }

  @ApiOperation({ summary: 'Issue a certificate for a NEW request' })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  @HttpCode(201)
  @Post('cert-requests/:id/issue')
  issueRequest(@Param('id') id: string, @Request() req: any) {
    // Permission check is performed inside the service because the scope depends
    // on the target entityId which is only known after loading the request.
    return this.svc.issueRequest(id, req.user.userId);
  }

  @ApiOperation({ summary: 'Get a certificate request by ID' })
  @ApiOkResponse({ type: CertRequestResponseDto })
  @RequirePermission('cert:read')
  @Get('cert-requests/:id')
  getRequest(@Param('id') id: string) {
    return this.svc.getRequest(id);
  }

  @ApiOperation({ summary: 'Get an issued certificate by serial number' })
  @ApiOkResponse({ type: CertificateResponseDto })
  @RequirePermission('cert:read')
  @Get('certificates/:serial')
  getCertificate(@Param('serial') serial: string, @Request() req: any) {
    return this.svc.getCertificate(serial, req.user?.userId);
  }

  @ApiOperation({
    summary: 'Revoke an issued certificate',
    description: 'Sets isRevoked=true, records revokedAt and revokedBy, and emits a CERTIFICATE_REVOKED audit event.',
  })
  @ApiOkResponse({ type: CertificateResponseDto })
  @HttpCode(200)
  @RequirePermission('cert:revoke')
  @Patch('certificates/:serial/revoke')
  revokeCertificate(
    @Param('serial') serial: string,
    @Body() dto: RevokeCertDto,
    @Request() req: any,
  ) {
    const revokedBy = dto.revokedBy ?? req.user?.username ?? 'unknown';
    return this.svc.revokeCertificate(serial, revokedBy, req.user?.userId);
  }
}
