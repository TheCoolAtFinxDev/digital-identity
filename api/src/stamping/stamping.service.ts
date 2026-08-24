import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from '../signing/signing.service';
import { CreateStampDto } from './dto/create-stamp.dto';
import { StampQueryDto } from './dto/stamp-query.dto';
import { PdfStampService } from './pdf-stamp.service';
import { StampStorageService } from './stamp-storage.service';

/** Base URL a QR code resolves to. Must be reachable by whoever scans the document. */
export const PUBLIC_VERIFY_BASE_URL = (
  process.env.PUBLIC_VERIFY_BASE_URL ?? 'http://localhost:8080'
).replace(/\/+$/, '');

@Injectable()
export class StampingService {
  private readonly logger = new Logger(StampingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly pdf: PdfStampService,
    private readonly storage: StampStorageService,
  ) {}

  verifyUrl(verificationId: string): string {
    return `${PUBLIC_VERIFY_BASE_URL}/v1/verify/document/${verificationId}`;
  }

  /**
   * Apply a digital stamp to an uploaded document.
   *
   * Order matters: the visible seal + QR are rendered FIRST, and the HSM then
   * signs the rendered bytes. That way the signature covers exactly the file the
   * recipient receives, so verification is a plain hash-and-verify of what they
   * hold — no need to strip the stamp back off before checking.
   */
  async stamp(file: Express.Multer.File | undefined, dto: CreateStampDto, userId?: string) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('A document file is required (multipart field "file")');
    }
    if (file.size > this.storage.maxFileBytes) {
      throw new PayloadTooLargeException(
        `Document exceeds the ${this.storage.maxFileBytes / (1024 * 1024)} MB limit`,
      );
    }

    const entity = await this.prisma.entity.findUnique({
      where: { id: dto.entityId },
      include: { orgProfile: { select: { legalName: true } } },
    });
    if (!entity) throw new NotFoundException(`Entity ${dto.entityId} not found`);

    if (dto.objectId) {
      const object = await this.prisma.objectRecord.findUnique({ where: { id: dto.objectId } });
      if (!object) throw new BadRequestException(`Object ${dto.objectId} not found`);
    }

    const original = file.buffer;
    const originalHash = this.storage.sha256(original);
    const documentName = dto.documentName?.trim() || file.originalname || 'document';
    const stampId = randomUUID();
    const verificationId = await this.nextVerificationId();
    const stampedAt = new Date();

    // ── 1. Visible layer ──────────────────────────────────────────────────────
    let stamped = original;
    let visibleStamp = false;
    let pageCount: number | null = null;

    const wantsVisible = dto.visible !== false;
    if (wantsVisible && this.pdf.isPdf(original)) {
      try {
        const rendered = await this.pdf.apply(
          original,
          {
            issuerName: entity.orgProfile?.legalName || entity.name,
            verificationId,
            verifyUrl: this.verifyUrl(verificationId),
            stampedAt,
          },
          dto.stampPage ?? 'LAST',
        );
        stamped = rendered.bytes;
        pageCount = rendered.pageCount;
        visibleStamp = true;
      } catch (err) {
        // Encrypted or malformed PDF — still worth a cryptographic stamp.
        this.logger.warn(
          `Visible stamp skipped for "${documentName}": ${(err as Error).message}. ` +
            'Falling back to a signature-only stamp.',
        );
      }
    }

    // ── 2. Cryptographic layer (HSM) ──────────────────────────────────────────
    const { record: signature, cert } = await this.signing.signBuffer(
      dto.entityId,
      stamped,
      documentName,
      userId,
    );
    const stampedHash = signature.payloadHash;

    // ── 3. Persist ────────────────────────────────────────────────────────────
    const storagePath = await this.storage.writeStamped(stampId, documentName, stamped);

    const row = await this.prisma.stampedDocument.create({
      data: {
        id: stampId,
        verificationId,
        entityId: dto.entityId,
        objectId: dto.objectId ?? null,
        signatureId: signature.id,
        certSerial: cert.serial,
        documentName,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: stamped.length,
        originalHash,
        stampedHash,
        visibleStamp,
        pageCount,
        storagePath,
        stampedById: userId ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.DOCUMENT_STAMPED,
        entityId: dto.entityId,
        userId: userId ?? null,
        detail: {
          stampId: row.id,
          verificationId,
          documentName,
          certSerial: cert.serial,
          signatureId: signature.id,
          originalHash,
          stampedHash,
          visibleStamp,
          objectId: dto.objectId ?? null,
        },
      },
    });

    return this.toResponse(row, entity.name);
  }

  async listStamps(query: StampQueryDto) {
    const where = query.entityId ? { entityId: query.entityId } : {};
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [total, rows] = await Promise.all([
      this.prisma.stampedDocument.count({ where }),
      this.prisma.stampedDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { entity: { select: { name: true } } },
      }),
    ]);

    return {
      data: rows.map((r) => this.toResponse(r, r.entity.name)),
      total,
      limit,
      offset,
    };
  }

  async getStamp(id: string) {
    const row = await this.prisma.stampedDocument.findUnique({
      where: { id },
      include: { entity: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException(`Stamp ${id} not found`);
    return this.toResponse(row, row.entity.name);
  }

  /** The stamped artifact itself — the file that carries the seal and QR. */
  async downloadStamp(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const row = await this.prisma.stampedDocument.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Stamp ${id} not found`);
    const buffer = await this.storage.read(row.storagePath);
    return { buffer, filename: row.documentName, mimeType: row.mimeType };
  }

  /** Standalone QR PNG, for reprints or portal display. */
  async qrPng(id: string): Promise<Buffer> {
    const row = await this.prisma.stampedDocument.findUnique({
      where: { id },
      select: { verificationId: true },
    });
    if (!row) throw new NotFoundException(`Stamp ${id} not found`);
    return this.pdf.qrPng(this.verifyUrl(row.verificationId));
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** STM-<year>-<10 hex>. Retries on the (vanishingly unlikely) unique clash. */
  private async nextVerificationId(): Promise<string> {
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `STM-${year}-${randomBytes(5).toString('hex').toUpperCase()}`;
      const clash = await this.prisma.stampedDocument.findUnique({
        where: { verificationId: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new Error('Could not allocate a unique verification ID');
  }

  private toResponse(
    row: {
      id: string;
      verificationId: string;
      entityId: string;
      objectId: string | null;
      signatureId: string;
      certSerial: string;
      documentName: string;
      mimeType: string;
      sizeBytes: number;
      originalHash: string;
      stampedHash: string | null;
      visibleStamp: boolean;
      pageCount: number | null;
      stampedById: string | null;
      createdAt: Date;
    },
    entityName?: string,
  ) {
    return {
      id: row.id,
      verificationId: row.verificationId,
      entityId: row.entityId,
      entityName: entityName ?? null,
      objectId: row.objectId,
      signatureId: row.signatureId,
      certSerial: row.certSerial,
      documentName: row.documentName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      originalHash: row.originalHash,
      stampedHash: row.stampedHash,
      visibleStamp: row.visibleStamp,
      pageCount: row.pageCount,
      stampedById: row.stampedById,
      stampedAt: row.createdAt,
      verifyUrl: this.verifyUrl(row.verificationId),
      downloadUrl: `/v1/stamps/${row.id}/download`,
    };
  }
}
