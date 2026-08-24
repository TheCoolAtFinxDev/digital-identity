import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from '../signing/signing.service';
import { StampStorageService } from './stamp-storage.service';
import { StampingService } from './stamping.service';

/**
 * Outcome of a document check, most-specific first:
 *   VALID              — bytes match the register and the signature + certificate hold
 *   TAMPERED           — a stamp was named but the bytes no longer hash to it
 *   NO_MATCHING_STAMP  — these bytes were never stamped by this platform
 *   SIGNATURE_INVALID  — bytes match but the signature does not verify (key mismatch/corruption)
 *   CERTIFICATE_REVOKED / CERTIFICATE_EXPIRED — proof is intact, trust is not
 *   UNVERIFIABLE_COPY  — the stamp is on record but no copy was available to re-verify
 */
export type DocumentVerificationStatus =
  | 'VALID'
  | 'TAMPERED'
  | 'NO_MATCHING_STAMP'
  | 'SIGNATURE_INVALID'
  | 'CERTIFICATE_REVOKED'
  | 'CERTIFICATE_EXPIRED'
  | 'UNVERIFIABLE_COPY';

@Injectable()
export class DocumentVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly storage: StampStorageService,
    private readonly stamping: StampingService,
  ) {}

  /**
   * Verify by identifier alone (the QR target). Answers "what does the register
   * say about this stamp, and does the copy we hold still verify?" — it cannot
   * speak for the copy in the reader's hand; that needs verifyUpload().
   */
  async verifyById(verificationId: string) {
    const stamp = await this.loadStamp(verificationId);
    const stored = await this.storage.read(stamp.storagePath).catch(() => null);

    // No copy on disk → say so rather than reporting an unchecked signature as
    // either valid or invalid. The upload endpoint is the authoritative check.
    if (!stored) {
      return this.buildResult(stamp, { signatureValid: null, hashMatches: true, registerIntact: null });
    }

    const registerIntact = this.storage.sha256(stored) === stamp.stampedHash;
    const signatureValid = await this.signing.opensslVerify(
      stamp.certificate.certPem,
      stored,
      Buffer.from(stamp.signature.signatureB64, 'base64'),
    );

    return this.buildResult(stamp, { signatureValid, hashMatches: registerIntact, registerIntact });
  }

  /**
   * Verify an actual file. This is the authoritative check: the uploaded bytes
   * are hashed and the stored signature is verified against THOSE bytes, so any
   * edit after stamping surfaces as TAMPERED rather than passing silently.
   */
  async verifyUpload(file: Express.Multer.File | undefined, verificationId?: string) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('A document file is required (multipart field "file")');
    }
    if (file.size > this.storage.maxFileBytes) {
      throw new PayloadTooLargeException(
        `Document exceeds the ${this.storage.maxFileBytes / (1024 * 1024)} MB limit`,
      );
    }

    const uploadedHash = this.storage.sha256(file.buffer);

    // Named stamp → check these bytes against it. Otherwise identify by hash.
    const stamp = verificationId
      ? await this.loadStamp(verificationId)
      : await this.findByHash(uploadedHash);

    if (!stamp) {
      await this.audit(null, 'NO_MATCHING_STAMP', { uploadedHash, documentName: file.originalname });
      return {
        valid: false,
        status: 'NO_MATCHING_STAMP' as DocumentVerificationStatus,
        message:
          'No stamp on record covers these exact bytes. The document was never stamped by this platform, or it has been altered since.',
        uploadedHash,
        checkedAt: new Date(),
      };
    }

    const hashMatches = uploadedHash === stamp.stampedHash;
    const signatureValid = hashMatches
      ? await this.signing.opensslVerify(
          stamp.certificate.certPem,
          file.buffer,
          Buffer.from(stamp.signature.signatureB64, 'base64'),
        )
      : false;

    return this.buildResult(stamp, { signatureValid, hashMatches, uploadedHash });
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private async loadStamp(verificationId: string) {
    const stamp = await this.prisma.stampedDocument.findUnique({
      where: { verificationId },
      include: {
        entity: { select: { id: true, name: true, country: true, entityType: true, status: true } },
        signature: true,
        object: { select: { id: true, objectType: true, reference: true } },
      },
    });
    if (!stamp) throw new NotFoundException(`No stamped document with verification ID ${verificationId}`);
    const certificate = await this.prisma.certificate.findUnique({ where: { serial: stamp.certSerial } });
    if (!certificate) {
      throw new NotFoundException(`Signing certificate ${stamp.certSerial} is no longer on record`);
    }
    return { ...stamp, certificate };
  }

  private async findByHash(hash: string) {
    const stamp = await this.prisma.stampedDocument.findFirst({
      where: { stampedHash: hash },
      orderBy: { createdAt: 'desc' },
      include: {
        entity: { select: { id: true, name: true, country: true, entityType: true, status: true } },
        signature: true,
        object: { select: { id: true, objectType: true, reference: true } },
      },
    });
    if (!stamp) return null;
    const certificate = await this.prisma.certificate.findUnique({ where: { serial: stamp.certSerial } });
    if (!certificate) return null;
    return { ...stamp, certificate };
  }

  private async buildResult(
    stamp: Awaited<ReturnType<DocumentVerificationService['loadStamp']>>,
    checks: {
      signatureValid: boolean | null; // null = could not be re-checked
      hashMatches: boolean;
      uploadedHash?: string;
      registerIntact?: boolean | null;
    },
  ) {
    const now = new Date();
    const cert = stamp.certificate;
    const isExpired = now > cert.validTo;
    const isRevoked = cert.isRevoked;

    const status: DocumentVerificationStatus = !checks.hashMatches
      ? 'TAMPERED'
      : checks.signatureValid === null
      ? 'UNVERIFIABLE_COPY'
      : !checks.signatureValid
      ? 'SIGNATURE_INVALID'
      : isRevoked
      ? 'CERTIFICATE_REVOKED'
      : isExpired
      ? 'CERTIFICATE_EXPIRED'
      : 'VALID';

    const valid = status === 'VALID';

    await this.audit(stamp.entityId, status, {
      verificationId: stamp.verificationId,
      certSerial: cert.serial,
      hashMatches: checks.hashMatches,
      signatureValid: checks.signatureValid,
      isRevoked,
      isExpired,
    });

    return {
      valid,
      status,
      message: this.explain(status),
      verificationId: stamp.verificationId,
      document: {
        name: stamp.documentName,
        mimeType: stamp.mimeType,
        sizeBytes: stamp.sizeBytes,
        pageCount: stamp.pageCount,
        visibleStamp: stamp.visibleStamp,
        stampedAt: stamp.createdAt,
        originalHash: stamp.originalHash,
        stampedHash: stamp.stampedHash,
        ...(checks.uploadedHash ? { uploadedHash: checks.uploadedHash } : {}),
        ...(checks.registerIntact === null || checks.registerIntact === undefined
          ? {}
          : { storedCopyIntact: checks.registerIntact }),
      },
      issuer: {
        entityId: stamp.entity.id,
        name: stamp.entity.name,
        country: stamp.entity.country,
        entityType: stamp.entity.entityType,
        entityStatus: stamp.entity.status,
      },
      object: stamp.object
        ? { id: stamp.object.id, objectType: stamp.object.objectType, reference: stamp.object.reference }
        : null,
      certificate: {
        serial: cert.serial,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        isRevoked,
        isExpired,
      },
      signature: {
        id: stamp.signature.id,
        hashAlg: stamp.signature.hashAlg,
        mechanism: stamp.signature.mechanism,
        signatureValid: checks.signatureValid,
      },
      checkedAt: now,
    };
  }

  private explain(status: DocumentVerificationStatus): string {
    switch (status) {
      case 'VALID':
        return 'Authentic. The document is unchanged since it was stamped and the issuing certificate is currently valid.';
      case 'TAMPERED':
        return 'The document has been altered since it was stamped — its content no longer matches the stamped record.';
      case 'SIGNATURE_INVALID':
        return 'The recorded signature does not verify against the issuing certificate.';
      case 'CERTIFICATE_REVOKED':
        return 'The document is unchanged, but the certificate that stamped it has been revoked.';
      case 'CERTIFICATE_EXPIRED':
        return 'The document is unchanged, but the certificate that stamped it has expired.';
      case 'NO_MATCHING_STAMP':
        return 'No stamp on record covers these bytes.';
      case 'UNVERIFIABLE_COPY':
        return 'The stamp is on record but no copy was available to re-verify. Upload the document to POST /v1/verify/document for an authoritative answer.';
    }
  }

  private async audit(entityId: string | null, status: string, detail: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.DOCUMENT_VERIFIED,
        entityId,
        detail: { status, ...detail },
      },
    });
  }
}
