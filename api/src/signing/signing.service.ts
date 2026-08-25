import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { execFile as execFileCb } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { SignDto } from './dto/sign.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';

const execFile = promisify(execFileCb);
const MECHANISM = 'SHA256-RSA-PKCS';

@Injectable()
export class SigningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sign content with an entity's HSM-held key. The private key never leaves
   * the HSM — pkcs11-tool asks the HSM (over pkcs11-proxy) to sign the content.
   * Only entities with an active HSM-managed certificate can be signed for here;
   * entities that hold their own key sign client-side.
   */
  async sign(dto: SignDto, userId?: string) {
    const content = Buffer.from(dto.payloadB64, 'base64');
    const { record, cert, payloadHash } = await this.signBuffer(
      dto.entityId,
      content,
      dto.documentName ?? null,
      userId,
    );

    return {
      id: record.id,
      entityId: record.entityId,
      certSerial: record.certSerial,
      hashAlg: record.hashAlg,
      mechanism: record.mechanism,
      payloadHash,
      signatureB64: record.signatureB64,
      documentName: record.documentName,
      signedAt: record.createdAt,
      signerCertPem: cert.certPem,
    };
  }

  /**
   * Sign raw bytes with the entity's HSM key and record the signature.
   * Shared by the /v1/signatures API and the F5 stamping service — both need
   * identical key selection, audit trail and non-repudiation record.
   */
  async signBuffer(entityId: string, content: Buffer, documentName: string | null, userId?: string) {
    const cert = await this.activeSigningCertificate(entityId);
    const payloadHash = createHash('sha256').update(content).digest('hex');
    const signatureB64 = await this.hsmSign(content, cert.hsmKeyId!);

    const record = await this.prisma.signature.create({
      data: {
        id: randomUUID(),
        entityId,
        certSerial: cert.serial,
        hashAlg: 'SHA-256',
        payloadHash,
        signatureB64,
        mechanism: MECHANISM,
        documentName,
        signedById: userId ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.DOCUMENT_SIGNED,
        entityId,
        userId: userId ?? null,
        detail: { signatureId: record.id, certSerial: cert.serial, payloadHash, documentName },
      },
    });

    return { record, cert, payloadHash };
  }

  /**
   * Sign raw bytes with an organisational UNIT's HSM key.
   *
   * The department stamp path (WP-5.3). Same mechanics as signBuffer, but the
   * key belongs to the unit, so the signature record names the unit as its
   * holder rather than a legal entity — that is what keeps the stamp verifying
   * after the head who released it has left.
   */
  async signBufferForUnit(orgUnitId: string, content: Buffer, documentName: string | null, userId?: string) {
    const cert = await this.activeUnitSigningCertificate(orgUnitId);
    const payloadHash = createHash('sha256').update(content).digest('hex');
    const signatureB64 = await this.hsmSign(content, cert.hsmKeyId!);

    const record = await this.prisma.signature.create({
      data: {
        id: randomUUID(),
        orgUnitId,
        certSerial: cert.serial,
        hashAlg: 'SHA-256',
        payloadHash,
        signatureB64,
        mechanism: MECHANISM,
        documentName,
        signedById: userId ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.DOCUMENT_SIGNED,
        userId: userId ?? null,
        detail: {
          signatureId: record.id, certSerial: cert.serial, payloadHash, documentName,
          holder: 'ORG_UNIT', orgUnitId,
        },
      },
    });

    return { record, cert, payloadHash };
  }

  /**
   * The unit's current key: newest, not revoked, not expired. The same rule
   * CertificateService.orgUnitSigningKey reports, applied here at signing time
   * — a key that was rotated away stays valid for what it already signed, but
   * must not be picked up for anything new.
   */
  private async activeUnitSigningCertificate(orgUnitId: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { hsmManaged: true, isRevoked: false, request: { orgUnitId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!cert || !cert.hsmKeyId) {
      throw new UnprocessableEntityException(
        'This unit has no active signing key. Issue one before releasing its seal.',
      );
    }
    if (new Date() > cert.validTo) {
      throw new UnprocessableEntityException(
        `The unit's signing certificate ${cert.serial} has expired. Rotate it before stamping.`,
      );
    }
    return cert;
  }

  /** Latest active, HSM-managed certificate for an entity — tells us which key to use. */
  private async activeSigningCertificate(entityId: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { hsmManaged: true, isRevoked: false, request: { entityId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!cert || !cert.hsmKeyId) {
      throw new UnprocessableEntityException(
        'No active HSM-managed signing key for this entity. ' +
          'Entities that hold their own private key must sign client-side.',
      );
    }
    if (new Date() > cert.validTo) {
      throw new UnprocessableEntityException(`Signing certificate ${cert.serial} has expired`);
    }
    return cert;
  }

  /** Verify a signature against an entity/certificate's public key + revocation status. */
  async verify(dto: VerifySignatureDto, userId?: string) {
    // Resolving by entityId alone is a convenience, and it has to guess which of
    // the entity's certificates signed. Prefer the HSM-managed one — that is the
    // only key this platform signs with — and fall back to any active
    // certificate for content signed client-side. Callers that know the answer
    // should pass certSerial; the sign response returns it for exactly this.
    const cert = dto.certSerial
      ? await this.prisma.certificate.findUnique({ where: { serial: dto.certSerial } })
      : dto.entityId
      ? (await this.prisma.certificate.findFirst({
          where: { hsmManaged: true, isRevoked: false, request: { entityId: dto.entityId } },
          orderBy: { createdAt: 'desc' },
        })) ??
        (await this.prisma.certificate.findFirst({
          where: { isRevoked: false, request: { entityId: dto.entityId } },
          orderBy: { createdAt: 'desc' },
        }))
      : null;

    if (!cert) {
      throw new NotFoundException('No certificate found for the given certSerial/entityId');
    }

    const content = Buffer.from(dto.payloadB64, 'base64');
    const signature = Buffer.from(dto.signatureB64, 'base64');
    const signatureValid = await this.opensslVerify(cert.certPem, content, signature);

    const now = new Date();
    const isExpired = now > cert.validTo;
    const valid = signatureValid && !cert.isRevoked && !isExpired;

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.SIGNATURE_VERIFIED,
        entityId: dto.entityId ?? undefined,
        userId: userId ?? null,
        detail: { certSerial: cert.serial, signatureValid, isRevoked: cert.isRevoked, isExpired, valid },
      },
    });

    return {
      valid,
      signatureValid,
      isRevoked: cert.isRevoked,
      isExpired,
      certSerial: cert.serial,
      subject: cert.subject,
      issuer: cert.issuer,
      checkedAt: now,
    };
  }

  async listForEntity(entityId: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found`);
    return this.prisma.signature.findMany({
      where: { entityId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, certSerial: true, hashAlg: true, mechanism: true, payloadHash: true, documentName: true, signedById: true, createdAt: true },
    });
  }

  // ─── HSM / OpenSSL helpers ───────────────────────────────────────────────────

  private async hsmSign(content: Buffer, keyId: string): Promise<string> {
    const module = process.env.PKCS11_MODULE ?? '/usr/local/lib/libpkcs11-proxy.so';
    const pin = process.env.HSM_USER_PIN ?? '';
    const proxy = process.env.PKCS11_PROXY_SOCKET ?? '';
    const work = mkdtempSync(join(tmpdir(), 'sign-'));
    const inPath = join(work, 'payload.bin');
    const sigPath = join(work, 'payload.sig');
    writeFileSync(inPath, content);
    try {
      await execFile('pkcs11-tool', [
        '--module', module, '--login', '--pin', pin,
        '--sign', '--mechanism', MECHANISM, '--id', keyId,
        '--input-file', inPath, '--output-file', sigPath,
      ], { timeout: 30000, env: { ...process.env, PKCS11_PROXY_SOCKET: proxy } });
      return readFileSync(sigPath).toString('base64');
    } catch (err) {
      throw new InternalServerErrorException(`HSM signing failed: ${(err as Error).message}`);
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Verify raw bytes against a certificate's public key. Public because the F5
   * document verification path re-checks stored signatures with the same code.
   */
  async opensslVerify(certPem: string, content: Buffer, signature: Buffer): Promise<boolean> {
    const work = mkdtempSync(join(tmpdir(), 'vrfy-'));
    const certPath = join(work, 'cert.pem');
    const pubPath = join(work, 'pub.pem');
    const inPath = join(work, 'payload.bin');
    const sigPath = join(work, 'payload.sig');
    writeFileSync(certPath, certPem);
    writeFileSync(inPath, content);
    writeFileSync(sigPath, signature);
    try {
      // Extract the public key from the certificate
      await execFile('openssl', ['x509', '-in', certPath, '-pubkey', '-noout'], { timeout: 5000 })
        .then((r) => writeFileSync(pubPath, r.stdout));
      // Verify: openssl exits 0 and prints "Verified OK" on success
      const res = await execFile('openssl', [
        'dgst', '-sha256', '-verify', pubPath, '-signature', sigPath, inPath,
      ], { timeout: 5000 });
      return /Verified OK/i.test(res.stdout);
    } catch {
      // openssl exits non-zero on verification failure — that's a valid "false"
      return false;
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
