import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditEvent, EntityStatus, EntityType, RequestStatus } from '@prisma/client';
import { execFile as execFileCb } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { IamService } from '../iam/iam.service';
import { ScopeResolverService } from '../iam/scope-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { CreateCertRequestDto } from './dto/create-cert-request.dto';

const execFile = promisify(execFileCb);

// Scopes that can qualify for scoped cert:issue checks
const { ENTITY, ORGANISATION } = { ENTITY: 'ENTITY' as const, ORGANISATION: 'ORGANISATION' as const };

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly iam: IamService,
    private readonly scopes: ScopeResolverService,
  ) {}

  async createRequest(dto: CreateCertRequestDto, userId?: string) {
    if (!dto.csrPem?.includes('BEGIN CERTIFICATE REQUEST')) {
      throw new BadRequestException('Invalid CSR PEM');
    }

    const profile = dto.profile ?? 'usr_entity_cert';

    if (profile === 'usr_entity_cert' && !dto.entityId) {
      throw new BadRequestException('entityId is required for the usr_entity_cert profile');
    }

    if (dto.entityId) {
      const entity = await this.prisma.entity.findUnique({ where: { id: dto.entityId } });
      if (!entity) {
        throw new BadRequestException(`Entity ${dto.entityId} not found`);
      }
    }

    const request = await this.prisma.certificateRequest.create({
      data: {
        csrPem: dto.csrPem,
        profile,
        entityId: dto.entityId ?? null,
      },
    });

    await this.audit(AuditEvent.REQUEST_CREATED, {
      requestId: request.id,
      entityId: request.entityId ?? undefined,
      userId,
      detail: { profile, entityId: request.entityId ?? null },
    });

    return request;
  }

  async issueRequest(id: string, userId: string) {
    const req = await this.prisma.certificateRequest.findUnique({
      where: { id },
      include: { entity: true },
    });

    if (!req) {
      throw new NotFoundException(`Certificate request ${id} not found`);
    }
    if (req.status !== RequestStatus.NEW) {
      throw new UnprocessableEntityException(`Request is already ${req.status}`);
    }

    // ── Permission check ─────────────────────────────────────────────────────
    // Check is done here (not via PermissionGuard) because scope depends on the
    // target entityId, which is only known after loading the request.
    const entityId = req.entityId ?? null;
    const canIssue = await this.resolveIssuePermission(userId, entityId, req.entity?.entityType ?? null);

    if (!canIssue) {
      await this.audit(AuditEvent.PERMISSION_CHECK_FAILED, {
        requestId: id,
        userId,
        detail: {
          permissionCode: 'cert:issue',
          entityId,
          route: `/v1/cert-requests/${id}/issue`,
          method: 'POST',
        },
      });
      throw new ForbiddenException(
        'Permission required: cert:issue (GLOBAL, ENTITY-scoped, or ORGANISATION-scoped)',
      );
    }

    // ── Entity status check ──────────────────────────────────────────────────
    // Leave request as NEW so it can be retried once the entity is approved.
    if (req.profile === 'usr_entity_cert') {
      if (!req.entity) {
        throw new UnprocessableEntityException('No entity linked to this request');
      }
      const entityApproved =
        req.entity.status === EntityStatus.APPROVED &&
        req.entity.kycStatus === 'APPROVED';

      if (!entityApproved) {
        await this.audit(AuditEvent.REQUEST_REJECTED, {
          requestId: id,
          userId,
          entityId: req.entityId ?? undefined,
          detail: {
            reason: 'ENTITY_NOT_APPROVED',
            entityStatus: req.entity.status,
            kycStatus: req.entity.kycStatus,
          },
        });
        // Request stays NEW — can be retried after entity is approved
        throw new UnprocessableEntityException(
          `Entity must be APPROVED before issuing a certificate. ` +
            `Current status: ${req.entity.status} / kycStatus: ${req.entity.kycStatus}`,
        );
      }
    }

    // ── CSR validation ───────────────────────────────────────────────────────
    const { subject, keyBits } = await this.policy.validateCsr(req.csrPem, req.profile);

    await this.prisma.certificateRequest.update({
      where: { id },
      data: { subject, keyBits },
    });

    // ── Signing ──────────────────────────────────────────────────────────────
    const caDir = process.env.CA_DIR ?? '/opt/ee-ca';
    // SANs are re-derived from the CSR and re-emitted by the issuer; the CA
    // itself never copies extensions out of an untrusted CSR.
    const sans = await this.policy.extractSubjectAltNames(req.csrPem);
    let signed: Awaited<ReturnType<typeof this.sign>>;

    try {
      signed = await this.sign(req.csrPem, req.profile, caDir, sans);
    } catch (err) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        requestId: id,
        userId,
        detail: { reason: 'SIGNING_FAILED', error: (err as Error).message },
      });
      await this.prisma.certificateRequest.update({
        where: { id },
        data: { status: RequestStatus.REJECTED },
      });
      throw err;
    }

    // ── Store certificate ────────────────────────────────────────────────────
    const certificate = await this.prisma.$transaction(async (tx) => {
      const cert = await tx.certificate.create({
        data: {
          serial: signed.serial,
          certPem: signed.certPem,
          profile: req.profile,
          subject,
          issuer: signed.issuer,
          fingerprint: signed.fingerprint,
          validFrom: signed.validFrom,
          validTo: signed.validTo,
          requestId: id,
        },
      });
      await tx.certificateRequest.update({
        where: { id },
        data: { status: RequestStatus.ISSUED },
      });
      return cert;
    });

    await this.audit(AuditEvent.CERTIFICATE_ISSUED, {
      requestId: id,
      userId,
      entityId: req.entityId ?? undefined,
      detail: { serial: signed.serial, fingerprint: signed.fingerprint },
    });

    return certificate;
  }

  /**
   * Managed (HSM-escrow) issuance: the CA generates the entity's keypair INSIDE
   * the HSM, builds the CSR with that key (via the OpenSSL pkcs11 engine), and
   * signs it with the intermediate CA. The private key never leaves the HSM —
   * the operator/entity authorises its later use via the HSM passphrase. No CSR
   * is ever supplied by the caller.
   */
  async issueManagedCertificate(entityId: string, userId: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      include: { orgProfile: true },
    });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found`);

    // Same scoped cert:issue resolution as inbound-CSR issuance
    const canIssue = await this.resolveIssuePermission(userId, entityId, entity.entityType);
    if (!canIssue) {
      await this.audit(AuditEvent.PERMISSION_CHECK_FAILED, {
        entityId, userId,
        detail: { permissionCode: 'cert:issue', route: '/v1/cert-requests/managed', method: 'POST' },
      });
      throw new ForbiddenException('Permission required: cert:issue');
    }

    // Entity must be APPROVED (same precondition as inbound issuance)
    if (!(entity.status === EntityStatus.APPROVED && entity.kycStatus === 'APPROVED')) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId, userId,
        detail: { reason: 'ENTITY_NOT_APPROVED', entityStatus: entity.status, kycStatus: entity.kycStatus },
      });
      throw new UnprocessableEntityException(
        `Entity must be APPROVED before issuing a certificate. Current status: ${entity.status} / kycStatus: ${entity.kycStatus}`,
      );
    }

    // Build the subject DN (policy_strict requires C, O, CN)
    const country = (entity.country || 'NA').toUpperCase();
    const orgName = (entity.orgProfile?.legalName || entity.name).replace(/[\/\n\r]/g, ' ').trim();
    const subject = `/C=${country}/O=${orgName}/CN=${orgName}`;

    // Unique PKCS#11 handle for this issuance
    const keyLabel = `entity-${entityId.slice(0, 8)}-${Date.now()}`;
    const keyId = randomBytes(8).toString('hex');
    const caDir = process.env.CA_DIR ?? '/opt/ee-ca';

    // 1) keygen in HSM + 2) build CSR signed by the in-HSM key
    let csrPem: string;
    try {
      csrPem = await this.generateManagedCsr(subject, keyLabel, keyId, caDir);
    } catch (err) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId, userId,
        detail: { reason: 'HSM_KEYGEN_OR_CSR_FAILED', error: (err as Error).message },
      });
      throw new InternalServerErrorException(`HSM key generation / CSR failed: ${(err as Error).message}`);
    }

    await this.audit(AuditEvent.KEY_GENERATED, {
      entityId, userId,
      detail: { keyLabel, keyId, custody: 'HSM', token: process.env.HSM_TOKEN_LABEL ?? 'econet-ca' },
    });

    // 3) sign with the intermediate CA (reuses the file-based CA, no engine)
    const profile = 'usr_entity_cert';
    const { subject: parsedSubject, keyBits } = await this.policy.validateCsr(csrPem, profile);
    let signed: Awaited<ReturnType<typeof this.sign>>;
    try {
      signed = await this.sign(csrPem, profile, caDir);
    } catch (err) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId, userId, detail: { reason: 'SIGNING_FAILED', error: (err as Error).message },
      });
      throw err;
    }

    // Persist request (straight to ISSUED) + HSM-managed certificate
    const certificate = await this.prisma.$transaction(async (tx) => {
      const req = await tx.certificateRequest.create({
        data: { status: RequestStatus.ISSUED, csrPem, profile, subject: parsedSubject, keyBits, entityId },
      });
      return tx.certificate.create({
        data: {
          serial: signed.serial,
          certPem: signed.certPem,
          profile,
          subject: parsedSubject,
          issuer: signed.issuer,
          fingerprint: signed.fingerprint,
          validFrom: signed.validFrom,
          validTo: signed.validTo,
          hsmManaged: true,
          hsmKeyLabel: keyLabel,
          hsmKeyId: keyId,
          requestId: req.id,
        },
      });
    });

    await this.audit(AuditEvent.CERTIFICATE_ISSUED, {
      entityId, userId,
      detail: { serial: signed.serial, fingerprint: signed.fingerprint, managed: true, keyLabel },
    });

    return certificate;
  }

  /**
   * Issue an HSM-managed certificate held by an organisational unit.
   *
   * This is the key a department stamp is signed with. It belongs to the unit,
   * not to whoever heads it, so the stamp keeps verifying after that head has
   * left the company — and revoking a departed person's own key never
   * invalidates the department's past stamps.
   *
   * A unit has no KYB of its own because it has no legal existence. It inherits
   * standing from the ORGANISATION entity its chart hangs off, so that entity
   * being APPROVED is the precondition. A deactivated unit is refused outright:
   * a dissolved department must not be able to start stamping again.
   */
  async issueForOrgUnit(orgUnitId: string, userId: string) {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      include: { entity: { include: { orgProfile: true } } },
    });
    if (!unit) throw new NotFoundException(`Org unit ${orgUnitId} not found`);

    const canIssue = await this.resolveIssuePermissionForUnit(userId, orgUnitId);
    if (!canIssue) {
      await this.audit(AuditEvent.PERMISSION_CHECK_FAILED, {
        entityId: unit.entityId, userId,
        detail: { permissionCode: 'cert:issue', orgUnitId, route: '/v1/cert-requests/org-unit', method: 'POST' },
      });
      throw new ForbiddenException('Permission required: cert:issue');
    }

    if (!unit.isActive) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId: unit.entityId, userId,
        detail: { reason: 'ORG_UNIT_DEACTIVATED', orgUnitId },
      });
      throw new UnprocessableEntityException(
        `${unit.name} is deactivated. A unit that no longer exists cannot be issued a signing key.`,
      );
    }

    const entity = unit.entity;
    if (!(entity.status === EntityStatus.APPROVED && entity.kycStatus === 'APPROVED')) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId: unit.entityId, userId,
        detail: {
          reason: 'ENTITY_NOT_APPROVED', orgUnitId,
          entityStatus: entity.status, kycStatus: entity.kycStatus,
        },
      });
      throw new UnprocessableEntityException(
        `${unit.name} inherits its standing from ${entity.name}, which must be APPROVED first. ` +
          `Current status: ${entity.status} / kycStatus: ${entity.kycStatus}`,
      );
    }

    // policy_strict supplies C, O and CN; OU is optional and is what names the
    // unit inside the organisation. CN reads as "Org — Unit" so a person looking
    // at the certificate in any viewer can tell whose department seal this is.
    const country = (entity.country || 'NA').toUpperCase();
    const clean = (v: string) => v.replace(/[\/\n\r]/g, ' ').trim();
    const orgName = clean(entity.orgProfile?.legalName || entity.name);
    const unitName = clean(unit.code ? `${unit.name} (${unit.code})` : unit.name);
    const subject = `/C=${country}/O=${orgName}/OU=${unitName}/CN=${orgName} - ${unitName}`;

    const keyLabel = `unit-${orgUnitId.slice(0, 8)}-${Date.now()}`;
    const keyId = randomBytes(8).toString('hex');
    const caDir = process.env.CA_DIR ?? '/opt/ee-ca';

    let csrPem: string;
    try {
      csrPem = await this.generateManagedCsr(subject, keyLabel, keyId, caDir);
    } catch (err) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId: unit.entityId, userId,
        detail: { reason: 'HSM_KEYGEN_OR_CSR_FAILED', orgUnitId, error: (err as Error).message },
      });
      throw new InternalServerErrorException(`HSM key generation / CSR failed: ${(err as Error).message}`);
    }

    await this.audit(AuditEvent.KEY_GENERATED, {
      entityId: unit.entityId, userId,
      detail: {
        keyLabel, keyId, custody: 'HSM', holder: 'ORG_UNIT', orgUnitId,
        unitName: unit.name, unitType: unit.unitType,
        token: process.env.HSM_TOKEN_LABEL ?? 'econet-ca',
      },
    });

    const profile = 'usr_entity_cert';
    const { subject: parsedSubject, keyBits } = await this.policy.validateCsr(csrPem, profile);
    let signed: Awaited<ReturnType<typeof this.sign>>;
    try {
      signed = await this.sign(csrPem, profile, caDir);
    } catch (err) {
      await this.audit(AuditEvent.REQUEST_REJECTED, {
        entityId: unit.entityId, userId,
        detail: { reason: 'SIGNING_FAILED', orgUnitId, error: (err as Error).message },
      });
      throw err;
    }

    const certificate = await this.prisma.$transaction(async (tx) => {
      const req = await tx.certificateRequest.create({
        data: {
          status: RequestStatus.ISSUED, csrPem, profile,
          subject: parsedSubject, keyBits,
          // entityId stays null — the holder is the unit, and the database
          // refuses a request that names both.
          orgUnitId,
        },
      });
      return tx.certificate.create({
        data: {
          serial: signed.serial,
          certPem: signed.certPem,
          profile,
          subject: parsedSubject,
          issuer: signed.issuer,
          fingerprint: signed.fingerprint,
          validFrom: signed.validFrom,
          validTo: signed.validTo,
          hsmManaged: true,
          hsmKeyLabel: keyLabel,
          hsmKeyId: keyId,
          requestId: req.id,
        },
      });
    });

    await this.audit(AuditEvent.CERTIFICATE_ISSUED, {
      entityId: unit.entityId, userId,
      detail: {
        serial: signed.serial, fingerprint: signed.fingerprint, managed: true,
        holder: 'ORG_UNIT', orgUnitId, unitName: unit.name, keyLabel,
      },
    });

    return { ...certificate, orgUnitId, unitName: unit.name, unitType: unit.unitType };
  }

  /** Generate a keypair in the HSM and return a CSR signed by that key. */
  private async generateManagedCsr(subject: string, label: string, keyId: string, caDir: string): Promise<string> {
    const module = process.env.PKCS11_MODULE ?? '/usr/local/lib/libpkcs11-proxy.so';
    const pin = process.env.HSM_USER_PIN ?? '';
    const token = process.env.HSM_TOKEN_LABEL ?? 'econet-ca';
    const proxy = process.env.PKCS11_PROXY_SOCKET ?? '';

    // 1) generate the keypair inside the HSM (private key non-extractable)
    await execFile('pkcs11-tool', [
      '--module', module, '--login', '--pin', pin,
      '--keypairgen', '--key-type', 'rsa:2048', '--label', label, '--id', keyId,
    ], { timeout: 30000, env: { ...process.env, PKCS11_PROXY_SOCKET: proxy } });

    // 2) build a CSR signed by that in-HSM key, via the OpenSSL pkcs11 engine
    const work = mkdtempSync(join(tmpdir(), 'mcsr-'));
    const csrPath = join(work, 'managed.csr.pem');
    try {
      await execFile('openssl', [
        'req', '-new', '-engine', 'pkcs11', '-keyform', 'engine',
        '-key', `pkcs11:token=${token};object=${label};type=private;pin-value=${pin}`,
        '-subj', subject, '-out', csrPath,
      ], {
        timeout: 30000,
        env: { ...process.env, OPENSSL_CONF: `${caDir}/hsm-engine.cnf`, PKCS11_PROXY_SOCKET: proxy },
      });
      return readFileSync(csrPath, 'utf8');
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async listRequests(page: number, limit: number, status?: string) {
    const where = status ? { status: status as RequestStatus } : {};
    const [total, data] = await Promise.all([
      this.prisma.certificateRequest.count({ where }),
      this.prisma.certificateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { certificate: { select: { serial: true } } },
      }),
    ]);
    return { data, total, page, limit };
  }

  async getRequest(id: string) {
    const req = await this.prisma.certificateRequest.findUnique({
      where: { id },
      include: { certificate: true },
    });
    if (!req) {
      throw new NotFoundException(`Certificate request ${id} not found`);
    }
    return req;
  }

  async getCertificate(serial: string, userId?: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { serial } });
    if (!cert) {
      throw new NotFoundException(`Certificate with serial ${serial} not found`);
    }
    await this.audit(AuditEvent.CERTIFICATE_VIEWED, { userId, detail: { serial } });
    return cert;
  }

  // ─── Lifecycle (F4) ──────────────────────────────────────────────────────────

  /** List/filter certificates: by entity, by expiry window, and revoked inclusion. */
  async listCertificates(opts: { entityId?: string; orgUnitId?: string; expiringInDays?: number; includeRevoked?: boolean }) {
    const where: Record<string, unknown> = {};
    if (opts.entityId) where['request'] = { entityId: opts.entityId };
    if (opts.orgUnitId) where['request'] = { orgUnitId: opts.orgUnitId };

    if (opts.expiringInDays != null) {
      const now = new Date();
      const horizon = new Date(now.getTime() + opts.expiringInDays * 86400000);
      where['isRevoked'] = false;
      where['validTo'] = { gt: now, lte: horizon };
    } else if (opts.includeRevoked === false) {
      where['isRevoked'] = false;
    }

    const certs = await this.prisma.certificate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        serial: true, subject: true, issuer: true, fingerprint: true,
        validFrom: true, validTo: true, isRevoked: true, revokedAt: true,
        hsmManaged: true, hsmKeyLabel: true, createdAt: true,
        request: {
          select: {
            entityId: true,
            orgUnitId: true,
            orgUnit: { select: { name: true, unitType: true, code: true } },
          },
        },
      },
    });

    const now = new Date();
    return certs.map((c) => {
      const { request, ...rest } = c;
      const status = c.isRevoked ? 'REVOKED' : now > c.validTo ? 'EXPIRED' : 'GOOD';
      return {
        ...rest,
        entityId: request?.entityId ?? null,
        orgUnitId: request?.orgUnitId ?? null,
        // Named so a list of serials is readable without a second lookup —
        // "Finance" says more at a glance than a UUID.
        orgUnitName: request?.orgUnit?.name ?? null,
        status,
      };
    });
  }

  /**
   * Renew an entity's managed certificate: issue a fresh HSM-managed cert first
   * (so there's no coverage gap), then optionally revoke the previously-active
   * managed cert(s) — i.e. rotation. Issuance enforces cert:issue + APPROVED.
   */
  async renewManaged(entityId: string, userId: string, revokePrevious = false) {
    const previous = revokePrevious
      ? await this.prisma.certificate.findMany({
          where: { hsmManaged: true, isRevoked: false, request: { entityId } },
          select: { serial: true },
        })
      : [];

    const renewed = await this.issueManagedCertificate(entityId, userId);

    const revoked: string[] = [];
    for (const p of previous) {
      if (p.serial === renewed.serial) continue;
      try {
        await this.revokeCertificate(p.serial, 'superseded-by-renewal', userId);
        revoked.push(p.serial);
      } catch { /* best-effort */ }
    }

    await this.audit(AuditEvent.CERTIFICATE_RENEWED, {
      entityId,
      userId,
      detail: {
        serial: renewed.serial,
        supersededSerials: revoked,
        rotated: revoked.length > 0,
      },
    });

    return { renewed, revokedPrevious: revoked };
  }

  async revokeCertificate(serial: string, revokedBy: string, userId?: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { serial } });
    if (!cert) {
      throw new NotFoundException(`Certificate with serial ${serial} not found`);
    }
    if (cert.isRevoked) {
      throw new UnprocessableEntityException(`Certificate ${serial} is already revoked`);
    }

    const updated = await this.prisma.certificate.update({
      where: { serial },
      data: { isRevoked: true, revokedAt: new Date(), revokedBy },
    });

    // Also mark it revoked in the CA database (index.txt) so the published CRL
    // reflects it. Best-effort: the DB flag is authoritative for status; failing
    // to update index.txt must not undo the user-visible revocation.
    let caDbUpdated = true;
    try {
      await this.revokeInCaDatabase(cert.certPem);
    } catch (err) {
      caDbUpdated = false;
    }

    await this.audit(AuditEvent.CERTIFICATE_REVOKED, {
      requestId: cert.requestId,
      userId,
      detail: { serial, revokedBy, caDbUpdated },
    });

    return updated;
  }

  /** Mark a certificate revoked in the CA database (index.txt) for CRL generation. */
  private async revokeInCaDatabase(certPem: string): Promise<void> {
    const caDir = process.env.CA_DIR ?? '/opt/ee-ca';
    const work = mkdtempSync(join(tmpdir(), 'revoke-'));
    const certPath = join(work, 'cert.pem');
    writeFileSync(certPath, certPem);
    try {
      await execFile('openssl', [
        'ca', '-config', `${caDir}/openssl.cnf`, '-revoke', certPath,
      ], { timeout: 15000 });
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolves whether userId may issue a certificate for the given entityId.
   * Resolution order (first match wins):
   *  1. GLOBAL cert:issue — may issue for any approved entity or no-entity requests.
   *  2. ENTITY-scoped cert:issue for the exact entityId.
   *  3. ORGANISATION-scoped cert:issue for an ORGANISATION entity (exact match only;
   *     relationship-backed PERSON issuance is tracked as a future refinement).
   */
  private async resolveIssuePermission(
    userId: string,
    entityId: string | null,
    entityType: EntityType | null,
  ): Promise<boolean> {
    if (!entityId) {
      // No entity linked — require GLOBAL cert:issue only
      return this.iam.hasPermission(userId, 'cert:issue');
    }

    // GLOBAL or ENTITY-scoped (IamService ORs GLOBAL + the given scope)
    const byEntity = await this.iam.hasPermission(userId, 'cert:issue', {
      type: ENTITY,
      scopeId: entityId,
    });
    if (byEntity) return true;

    // ORGANISATION-scoped — only for ORGANISATION entities, exact entity match
    if (entityType === EntityType.ORGANISATION) {
      return this.iam.hasPermission(userId, 'cert:issue', {
        type: ORGANISATION,
        scopeId: entityId,
      });
    }

    return false;
  }

  /**
   * cert:issue for a unit-held certificate.
   *
   * Reuses the same resolver the permission guard uses, so the rule is stated
   * once: a grant on the unit, on any unit above it, or on the organisation
   * entity the chart hangs off. A division-scoped certificate manager can
   * therefore issue keys for the departments beneath them and nowhere else.
   */
  private async resolveIssuePermissionForUnit(userId: string, orgUnitId: string): Promise<boolean> {
    if (await this.iam.hasPermission(userId, 'cert:issue')) return true;

    const candidates = await this.scopes.resolve(
      { target: 'ORG_UNIT', from: 'param', name: 'id' },
      { params: { id: orgUnitId }, body: {} },
    );
    if (!candidates?.length) return false;

    return this.iam.hasPermission(userId, 'cert:issue', candidates);
  }

  private async sign(csrPem: string, profile: string, caDir: string, sans: string[] = []) {
    const work = mkdtempSync(join(tmpdir(), 'sign-'));
    const csrPath = join(work, 'req.csr.pem');
    const certPath = join(work, 'cert.pem');
    writeFileSync(csrPath, csrPem, { mode: 0o600 });

    try {
      // Extensions come from a generated file so the issuer can add the
      // revocation/issuer pointers and any validated SANs on top of the static
      // profile. Falls back to the profile in openssl.cnf if generation fails.
      const extFile = this.buildExtensionFile(profile, caDir, work, sans);

      await execFile(
        'openssl',
        [
          'ca',
          '-config', `${caDir}/openssl.cnf`,
          '-in', csrPath,
          '-out', certPath,
          '-batch',
          '-notext',
          ...(extFile ? ['-extfile', extFile] : []),
          '-extensions', profile,
        ],
        { timeout: 15000 },
      ).catch((err) => {
        throw new InternalServerErrorException(`OpenSSL signing failed: ${err.message}`);
      });

      const certPem = readFileSync(certPath, 'utf8');

      const [serialOut, datesOut, issuerOut, fingerprintOut] = await Promise.all([
        execFile('openssl', ['x509', '-serial', '-noout', '-in', certPath], { timeout: 5000 }),
        execFile('openssl', ['x509', '-noout', '-startdate', '-enddate', '-in', certPath], { timeout: 5000 }),
        execFile('openssl', ['x509', '-issuer', '-noout', '-in', certPath], { timeout: 5000 }),
        execFile('openssl', ['x509', '-fingerprint', '-sha256', '-noout', '-in', certPath], { timeout: 5000 }),
      ]);

      const serial = serialOut.stdout.replace(/^serial=\s*/i, '').trim();
      const issuer = issuerOut.stdout.replace(/^issuer=\s*/i, '').trim();
      const fingerprint = fingerprintOut.stdout.replace(/^.*Fingerprint=\s*/i, '').trim();

      const startMatch = datesOut.stdout.match(/notBefore=(.+)/);
      const endMatch = datesOut.stdout.match(/notAfter=(.+)/);

      if (!startMatch || !endMatch) {
        throw new InternalServerErrorException('Could not parse certificate validity dates');
      }

      return {
        certPem,
        serial,
        issuer,
        fingerprint,
        validFrom: new Date(startMatch[1].trim()),
        validTo: new Date(endMatch[1].trim()),
      };
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Compose the extension section used for this issuance:
   *
   *   base profile from openssl.cnf
   *   + crlDistributionPoints / authorityInfoAccess  (so relying parties can
   *     actually find the CRL we publish at /v1/crl.pem and the issuer chain —
   *     without these a standard client never checks revocation)
   *   + subjectAltName, re-emitted from the CSR after validation
   *
   * Returns the file path, or null when there is nothing to add and the static
   * profile can be used as-is.
   */
  private buildExtensionFile(
    profile: string,
    caDir: string,
    workDir: string,
    sans: string[],
  ): string | null {
    const base = process.env.PKI_BASE_URL?.replace(/\/+$/, '');
    const crlUrl = process.env.PKI_CRL_URL ?? (base ? `${base}/v1/crl.pem` : undefined);
    const issuersUrl = process.env.PKI_CA_ISSUERS_URL ?? (base ? `${base}/v1/ca/chain` : undefined);
    const ocspUrl = process.env.PKI_OCSP_URL; // only when a responder is actually deployed

    const additions: string[] = [];
    if (crlUrl) additions.push(`crlDistributionPoints = URI:${crlUrl}`);

    const aia: string[] = [];
    if (ocspUrl) aia.push(`OCSP;URI:${ocspUrl}`);
    if (issuersUrl) aia.push(`caIssuers;URI:${issuersUrl}`);
    if (aia.length) additions.push(`authorityInfoAccess = ${aia.join(',')}`);

    if (sans.length) additions.push(`subjectAltName = ${sans.join(', ')}`);

    if (additions.length === 0) return null;

    let baseLines: string[];
    try {
      baseLines = this.readProfileSection(`${caDir}/openssl.cnf`, profile);
    } catch (err) {
      this.logger.warn(
        `Could not read profile "${profile}" from openssl.cnf (${(err as Error).message}); ` +
          'issuing with the static profile — no CRL/AIA/SAN extensions.',
      );
      return null;
    }

    // Drop any base line whose key we are about to set, so the section has no
    // duplicate keys.
    const overridden = new Set(additions.map((line) => line.split('=')[0].trim()));
    const kept = baseLines.filter((line) => {
      const key = line.split('=')[0].trim();
      return !overridden.has(key);
    });

    const extPath = join(workDir, 'ext.cnf');
    writeFileSync(extPath, `[ ${profile} ]\n${[...kept, ...additions].join('\n')}\n`, { mode: 0o600 });
    return extPath;
  }

  /** Read the body lines of a `[ section ]` from an OpenSSL config file. */
  private readProfileSection(configPath: string, section: string): string[] {
    const content = readFileSync(configPath, 'utf8');
    const lines = content.split('\n');
    const start = lines.findIndex((l) => l.trim().replace(/\s+/g, '') === `[${section}]`);
    if (start === -1) throw new Error(`section [${section}] not found`);

    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\s*\[/.test(line)) break;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      body.push(trimmed);
    }
    return body;
  }

  private async audit(
    event: AuditEvent,
    opts: { requestId?: string; entityId?: string; userId?: string; detail?: object } = {},
  ) {
    await this.prisma.auditLog.create({
      data: {
        event,
        requestId: opts.requestId ?? null,
        entityId: opts.entityId ?? null,
        userId: opts.userId ?? null,
        detail: opts.detail ?? undefined,
      },
    });
  }
}
