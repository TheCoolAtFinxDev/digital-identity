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
import { IssueOrgUnitCertDto } from './dto/issue-org-unit.dto';
import { IssueManagedDto } from './dto/issue-managed.dto';
import { CertListQueryDto } from './dto/cert-list-query.dto';
import { RenewManagedDto } from './dto/renew-managed.dto';
import { RevokeCertDto } from './dto/revoke-cert.dto';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope, ScopedTo } from '../iam/scope.decorator';

@ApiBearerAuth()
@ApiTags('certificates')
@Controller('v1')
export class CertificateController {
  constructor(private readonly svc: CertificateService) {}

  @ApiOperation({ summary: 'List certificate requests (paginated)' })
  @ApiOkResponse({ type: CertRequestPageDto })
  @RequirePermission('cert:read')
  @GlobalScope()
  @Get('cert-requests')
  listRequests(@Query() q: CertRequestQueryDto) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));
    return this.svc.listRequests(page, limit, q.status);
  }

  @ApiOperation({ summary: 'Submit a new certificate signing request' })
  @ApiCreatedResponse({ type: CertRequestResponseDto })
  @RequirePermission('cert:request')
  @ScopedTo({ target: 'ENTITY', from: 'body', name: 'entityId' })
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

  @ApiOperation({
    summary: "Issue a managed signing key for an organisational unit",
    description:
      "The key a department stamp is signed with. Held by the unit rather than by whoever heads it, so the stamp keeps verifying after that head leaves. The unit must be active and the ORGANISATION entity its chart hangs off must be APPROVED — a unit has no KYB of its own.",
  })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  @HttpCode(201)
  @Post('cert-requests/org-unit')
  issueForOrgUnit(@Body() dto: IssueOrgUnitCertDto, @Request() req: any) {
    // Scoped cert:issue is resolved inside the service, as for the entity path:
    // the target unit is in the body, and the rule walks the org chart.
    return this.svc.issueForOrgUnit(dto.orgUnitId, req.user.userId);
  }

  @ApiOperation({
    summary: "Rotate an organisational unit's signing key",
    description:
      "Issues a fresh key and RETIRES the previous one WITHOUT revoking it, so every document already stamped under it keeps verifying until it expires. Revocation is for a compromised key, where invalidating what it signed is the point.",
  })
  @ApiCreatedResponse()
  @HttpCode(201)
  @Post('cert-requests/org-unit/rotate')
  rotateOrgUnitKey(@Body() dto: IssueOrgUnitCertDto, @Request() req: any) {
    return this.svc.rotateOrgUnitKey(dto.orgUnitId, req.user.userId);
  }

  @ApiOperation({
    summary: "The key a unit's stamp is signed with, and the keys it used to use",
    description:
      'Reports the current key, the retired-but-still-valid ones, and why the unit cannot stamp if it cannot.',
  })
  @ApiOkResponse()
  @RequirePermission('cert:read')
  @ScopedTo({ target: 'ORG_UNIT', from: 'param', name: 'id' })
  @Get('org-units/:id/signing-key')
  orgUnitSigningKey(@Param('id') id: string) {
    return this.svc.orgUnitSigningKey(id);
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
  @ScopedTo({ target: 'CERT_REQUEST', from: 'param', name: 'id' })
  @Get('cert-requests/:id')
  getRequest(@Param('id') id: string) {
    return this.svc.getRequest(id);
  }

  @ApiOperation({ summary: 'List/filter issued certificates (by entity, expiry window)' })
  @ApiOkResponse()
  @RequirePermission('cert:read')
  @GlobalScope()
  @Get('certificates')
  listCertificates(@Query() q: CertListQueryDto) {
    return this.svc.listCertificates({
      entityId: q.entityId,
      orgUnitId: q.orgUnitId,
      expiringInDays: q.expiringInDays,
      includeRevoked: q.includeRevoked,
    });
  }

  @ApiOperation({
    summary: 'Renew (and optionally rotate) an entity\'s managed certificate',
    description: 'Issues a fresh HSM-managed certificate first (no coverage gap), then optionally revokes the previously active managed cert(s). Requires cert:issue + APPROVED entity.',
  })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  @HttpCode(201)
  @Post('certificates/renew')
  renew(@Body() dto: RenewManagedDto, @Request() req: any) {
    return this.svc.renewManaged(dto.entityId, req.user.userId, dto.revokePrevious ?? false);
  }

  @ApiOperation({ summary: 'Get an issued certificate by serial number' })
  @ApiOkResponse({ type: CertificateResponseDto })
  @RequirePermission('cert:read')
  @ScopedTo({ target: 'CERTIFICATE', from: 'param', name: 'serial' })
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
  @ScopedTo({ target: 'CERTIFICATE', from: 'param', name: 'serial' })
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
