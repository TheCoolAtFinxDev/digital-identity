import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { CreateCertRequestDto } from './dto/create-cert-request.dto';

const execFile = promisify(execFileCb);

// Scopes that can qualify for scoped cert:issue checks
const { ENTITY, ORGANISATION } = { ENTITY: 'ENTITY' as const, ORGANISATION: 'ORGANISATION' as const };

@Injectable()
export class CertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly iam: IamService,
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
    let signed: Awaited<ReturnType<typeof this.sign>>;

    try {
      signed = await this.sign(req.csrPem, req.profile, caDir);
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

    await this.audit(AuditEvent.CERTIFICATE_REVOKED, {
      requestId: cert.requestId,
      userId,
      detail: { serial, revokedBy },
    });

    return updated;
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

  private async sign(csrPem: string, profile: string, caDir: string) {
    const work = mkdtempSync(join(tmpdir(), 'sign-'));
    const csrPath = join(work, 'req.csr.pem');
    const certPath = join(work, 'cert.pem');
    writeFileSync(csrPath, csrPem, { mode: 0o600 });

    try {
      await execFile(
        'openssl',
        [
          'ca',
          '-config', `${caDir}/openssl.cnf`,
          '-in', csrPath,
          '-out', certPath,
          '-batch',
          '-notext',
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
