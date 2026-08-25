import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditEvent, DocumentStanding, SignatureStatus, StampRequestStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from '../signing/signing.service';
import { PdfStampService } from '../stamping/pdf-stamp.service';
import { StampStorageService } from '../stamping/stamp-storage.service';
import { meta, person, personOrUnknown, seal, stampSubtitle } from './staff.presenter';

/**
 * What a staff member does with a document on their own authority: bring it in,
 * sign it, ask other people to sign it, take it back when it was wrong, and
 * replace it with a corrected version.
 *
 * Everything here is scoped to the acting person. There is no "list all
 * documents" — a document belongs to whoever brought it in, and the only other
 * people who can see it are the ones asked to do something with it.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly storage: StampStorageService,
    private readonly pdf: PdfStampService,
  ) {}

  // ── Bringing a document in ─────────────────────────────────────────────────

  async upload(file: Express.Multer.File | undefined, name: string | undefined, userId: string) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('A document file is required (multipart field "file")');
    }
    if (file.size > this.storage.maxFileBytes) {
      throw new PayloadTooLargeException(
        `Document exceeds the ${this.storage.maxFileBytes / (1024 * 1024)} MB limit`,
      );
    }

    const id = randomUUID();
    const documentName = name?.trim() || file.originalname || 'document';
    const contentHash = this.storage.sha256(file.buffer);
    const storagePath = await this.storage.writeDocument(id, documentName, file.buffer);

    let pageCount: number | null = null;
    if (this.pdf.isPdf(file.buffer)) {
      pageCount = await this.pdf.pageCount(file.buffer).catch(() => null);
    }

    const doc = await this.prisma.document.create({
      data: {
        id,
        name: documentName,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        pageCount,
        contentHash,
        storagePath,
        ownerId: userId,
        standing: DocumentStanding.DRAFT,
      },
    });

    await this.audit(AuditEvent.DOCUMENT_UPLOADED, userId, {
      documentId: doc.id, name: documentName, contentHash, sizeBytes: file.size,
    });

    return this.detail(doc.id, userId);
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  /**
   * Sign with your own key.
   *
   * The signature is made over the document's exact stored bytes, which is what
   * makes it checkable later: whoever verifies re-hashes the file they hold and
   * compares. Signing does not modify the document — a personal signature is a
   * separate record, not an overlay.
   */
  async sign(documentId: string, userId: string, note?: string) {
    const doc = await this.requireVisible(documentId, userId);

    if (doc.standing === DocumentStanding.RECALLED) {
      throw new UnprocessableEntityException(
        `${doc.name} has been recalled and cannot be signed. Sign the replacement instead.`,
      );
    }

    const existing = await this.prisma.documentSignature.findUnique({
      where: { documentId_signerId: { documentId, signerId: userId } },
    });
    if (existing?.status === SignatureStatus.SIGNED) {
      throw new UnprocessableEntityException('You have already signed this document.');
    }

    const bytes = await this.storage.read(doc.storagePath);
    const person = await this.requirePersonalIdentity(userId);

    // Signs with the person's own HSM-managed key, selected the same way every
    // other signature on the platform is.
    const { record, cert } = await this.signing.signBuffer(person.entityId, bytes, doc.name, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentSignature.upsert({
        where: { documentId_signerId: { documentId, signerId: userId } },
        create: {
          documentId,
          signerId: userId,
          status: SignatureStatus.SIGNED,
          signatureId: record.id,
          certSerial: cert.serial,
          note: note ?? null,
          signedAt: new Date(),
        },
        update: {
          status: SignatureStatus.SIGNED,
          signatureId: record.id,
          certSerial: cert.serial,
          note: note ?? null,
          signedAt: new Date(),
        },
      });

      // A document that has been stamped stays STAMPED — a stamp is the stronger
      // statement and must not be downgraded by a later personal signature.
      if (doc.standing === DocumentStanding.DRAFT) {
        await tx.document.update({
          where: { id: documentId },
          data: { standing: DocumentStanding.SIGNED },
        });
      }
    });

    return this.detail(documentId, userId);
  }

  /** Route a document to named signers and track who still owes one. */
  async requestSignatures(documentId: string, signerIds: string[], userId: string) {
    const doc = await this.requireOwner(documentId, userId, 'ask for signatures on');

    if (doc.standing === DocumentStanding.RECALLED) {
      throw new UnprocessableEntityException(`${doc.name} has been recalled.`);
    }
    if (!signerIds.length) {
      throw new BadRequestException('Name at least one person to sign.');
    }
    if (signerIds.includes(userId)) {
      throw new BadRequestException(
        'You do not need to ask yourself — sign it directly instead.',
      );
    }

    const signers = await this.prisma.user.findMany({
      where: { id: { in: signerIds }, isActive: true },
      select: { id: true },
    });
    if (signers.length !== signerIds.length) {
      throw new BadRequestException('One or more of those people do not exist or are deactivated.');
    }

    for (const signerId of signerIds) {
      // Asking again is a reminder, not a second obligation, so an existing
      // pending ask is left exactly as it is — including its requestedAt, which
      // is what the queue ages from.
      await this.prisma.documentSignature.upsert({
        where: { documentId_signerId: { documentId, signerId } },
        create: { documentId, signerId, requestedById: userId, status: SignatureStatus.AWAITING_SIGNATURE },
        update: {},
      });
    }

    await this.audit(AuditEvent.SIGNATURE_REQUESTED, userId, {
      documentId, signerIds, name: doc.name,
    });

    return this.detail(documentId, userId);
  }

  async decline(documentId: string, userId: string, reason: string) {
    const ask = await this.prisma.documentSignature.findUnique({
      where: { documentId_signerId: { documentId, signerId: userId } },
    });
    if (!ask) throw new NotFoundException('You were not asked to sign this document.');
    if (ask.status !== SignatureStatus.AWAITING_SIGNATURE) {
      throw new UnprocessableEntityException(`You have already ${ask.status.toLowerCase()} this document.`);
    }

    await this.prisma.documentSignature.update({
      where: { documentId_signerId: { documentId, signerId: userId } },
      data: { status: SignatureStatus.DECLINED, note: reason, signedAt: new Date() },
    });

    await this.audit(AuditEvent.SIGNATURE_DECLINED, userId, { documentId, reason });

    return this.detail(documentId, userId);
  }

  // ── Recall and replace ─────────────────────────────────────────────────────

  /**
   * Withdraw ONE document without revoking the key that signed it.
   *
   * This is the distinction the platform did not have: revocation kills every
   * document a key ever touched, which is far too blunt for "wrong VAT rate on
   * one invoice". A recall marks this document withdrawn and says why; the key
   * keeps working and every other document it signed stays valid.
   */
  async recall(documentId: string, userId: string, reason: string) {
    const doc = await this.requireOwner(documentId, userId, 'recall');

    if (doc.standing === DocumentStanding.RECALLED) {
      throw new UnprocessableEntityException(`${doc.name} has already been recalled.`);
    }
    if (doc.standing === DocumentStanding.DRAFT) {
      throw new UnprocessableEntityException(
        'Nothing has been issued for this document yet, so there is nothing to recall.',
      );
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        standing: DocumentStanding.RECALLED,
        recalledAt: new Date(),
        recalledById: userId,
        recallReason: reason,
      },
    });

    await this.audit(AuditEvent.DOCUMENT_RECALLED, userId, {
      documentId, name: doc.name, reason,
      note: 'One document withdrawn. No certificate was revoked.',
    });

    return this.detail(documentId, userId);
  }

  /**
   * Supersede a document with a corrected version.
   *
   * The old document is not deleted and not recalled-into-silence: it is marked
   * SUPERSEDED and points at its replacement, so anyone holding the old copy and
   * checking it is told where the current version is rather than simply that
   * this one is no good.
   */
  async replace(
    documentId: string,
    file: Express.Multer.File | undefined,
    name: string | undefined,
    userId: string,
  ) {
    const original = await this.requireOwner(documentId, userId, 'replace');

    if (original.supersededById) {
      throw new UnprocessableEntityException(
        `${original.name} has already been replaced.`,
      );
    }

    const replacement = await this.upload(file, name ?? `${original.name}`, userId);

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        // A recalled document STAYS recalled. Recall and supersession answer
        // different questions — "why should I not rely on this" and "where is
        // the good one" — and overwriting the first with the second would throw
        // away the reason, which is the part a recipient actually needs.
        standing:
          original.standing === DocumentStanding.RECALLED
            ? DocumentStanding.RECALLED
            : DocumentStanding.SUPERSEDED,
        supersededById: replacement.id,
      },
    });

    await this.audit(AuditEvent.DOCUMENT_REPLACED, userId, {
      documentId, replacedById: replacement.id, name: original.name,
    });

    return this.detail(replacement.id, userId);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  async download(documentId: string, userId: string) {
    const doc = await this.requireVisible(documentId, userId);

    // If the document has been stamped, the stamped artifact — seal and QR
    // rendered on — is the file the recipient should hold, not the input.
    const stamped = await this.prisma.stampRequest.findFirst({
      where: { documentId, status: StampRequestStatus.STAMPED, stampedDocumentId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: { stampedDocument: true },
    });

    if (stamped?.stampedDocument) {
      return {
        buffer: await this.storage.read(stamped.stampedDocument.storagePath),
        filename: stamped.stampedDocument.documentName,
        mimeType: stamped.stampedDocument.mimeType,
      };
    }

    return {
      buffer: await this.storage.read(doc.storagePath),
      filename: doc.name,
      mimeType: doc.mimeType,
    };
  }

  /** The DocumentDetail shape the S6 detail screen is built against. */
  async detail(documentId: string, userId: string) {
    const doc = await this.requireVisible(documentId, userId);

    const [signatures, stampReq, recalledBy, supersededBy] = await Promise.all([
      this.prisma.documentSignature.findMany({
        where: { documentId },
        orderBy: { requestedAt: 'asc' },
        include: {
          signer: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        },
      }),
      this.prisma.stampRequest.findFirst({
        where: { documentId },
        orderBy: { createdAt: 'desc' },
        include: {
          orgUnit: { select: { name: true, code: true, unitType: true } },
          requester: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
          reviewer: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
          approver: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
          stampedDocument: true,
        },
      }),
      doc.recalledById
        ? this.prisma.user.findUnique({ where: { id: doc.recalledById }, select: { username: true, displayName: true } })
        : Promise.resolve(null),
      doc.supersededById
        ? this.prisma.document.findUnique({ where: { id: doc.supersededById }, select: { id: true, name: true } })
        : Promise.resolve(null),
    ]);

    const cert = stampReq?.stampedDocument
      ? await this.prisma.certificate.findUnique({ where: { serial: stampReq.stampedDocument.certSerial } })
      : null;

    const trail = this.buildTrail(doc, signatures, stampReq, recalledBy);

    const isRecalled = doc.standing === DocumentStanding.RECALLED;
    const isSuperseded = doc.standing === DocumentStanding.SUPERSEDED;

    return {
      id: doc.id,
      name: doc.name,
      standing: doc.standing === DocumentStanding.DRAFT ? 'SIGNED' : doc.standing,
      pageCount: doc.pageCount ?? 0,
      sizeBytes: doc.sizeBytes,
      stampedAt: stampReq?.stampedDocument?.createdAt?.toISOString() ?? null,
      verificationId: stampReq?.stampedDocument?.verificationId ?? null,
      seal: seal(stampReq?.orgUnit),
      certificate: cert
        ? {
            serial: cert.serial,
            holder: stampReq?.orgUnit ? `${stampReq.orgUnit.name} department key` : cert.subject,
            validTo: cert.validTo.toISOString(),
            isRevoked: cert.isRevoked,
          }
        : null,
      contentHash: doc.contentHash,
      trail,
      // Only the owner can withdraw or replace, and only something that has
      // actually been issued.
      canRecall: doc.ownerId === userId && !isRecalled && doc.standing !== DocumentStanding.DRAFT,
      canReplace: doc.ownerId === userId && !isSuperseded && !doc.supersededById,
      recall: isRecalled
        ? {
            at: doc.recalledAt!.toISOString(),
            by: recalledBy ? recalledBy.displayName || recalledBy.username : 'unknown',
            reason: doc.recallReason ?? '',
          }
        : null,
      supersededBy: supersededBy ? { id: supersededBy.id, name: supersededBy.name } : null,
    };
  }

  private buildTrail(
    doc: { recalledAt: Date | null; recallReason: string | null },
    signatures: Array<any>,
    stampReq: any,
    recalledBy: { username: string; displayName: string | null } | null,
  ) {
    const entries: Array<{ actor: any; what: string; at: string; outcome: string }> = [];

    for (const sig of signatures) {
      if (sig.status === SignatureStatus.SIGNED && sig.signedAt) {
        entries.push({
          actor: personOrUnknown(sig.signer),
          what: sig.requestedById ? 'Signed after being asked' : 'Signed with their personal key',
          at: sig.signedAt.toISOString(),
          outcome: 'SIGNED',
        });
      } else if (sig.status === SignatureStatus.DECLINED && sig.signedAt) {
        entries.push({
          actor: personOrUnknown(sig.signer),
          what: sig.note ? `Declined to sign — ${sig.note}` : 'Declined to sign',
          at: sig.signedAt.toISOString(),
          outcome: 'REJECTED',
        });
      }
    }

    if (stampReq) {
      if (stampReq.submittedAt) {
        entries.push({
          actor: personOrUnknown(stampReq.requester),
          what: `Requested the ${stampReq.orgUnit.name} seal`,
          at: stampReq.submittedAt.toISOString(),
          outcome: 'SIGNED',
        });
      }
      if (stampReq.reviewedAt) {
        entries.push({
          actor: personOrUnknown(stampReq.reviewer),
          what: 'Reviewed as line manager',
          at: stampReq.reviewedAt.toISOString(),
          outcome: 'REVIEWED',
        });
      }
      if (stampReq.approvedAt) {
        entries.push({
          actor: personOrUnknown(stampReq.approver),
          what: `Approved as head of ${stampReq.orgUnit.name} — released the department seal`,
          at: stampReq.approvedAt.toISOString(),
          outcome: 'APPROVED',
        });
      }
      if (stampReq.rejectedAt) {
        entries.push({
          actor: personOrUnknown(stampReq.reviewer ?? stampReq.approver),
          what: stampReq.rejectionReason
            ? `Rejected the request — ${stampReq.rejectionReason}`
            : 'Rejected the request',
          at: stampReq.rejectedAt.toISOString(),
          outcome: 'REJECTED',
        });
      }
    }

    if (doc.recalledAt) {
      entries.push({
        actor: {
          id: '',
          displayName: recalledBy ? recalledBy.displayName || recalledBy.username : 'unknown',
          unitName: null,
        },
        what: doc.recallReason ? `Recalled the document — ${doc.recallReason}` : 'Recalled the document',
        at: doc.recalledAt.toISOString(),
        outcome: 'RECALLED',
      });
    }

    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }

  // ── Access ─────────────────────────────────────────────────────────────────

  /**
   * A document is visible to the person who owns it and to anyone the workflow
   * has put in front of it — someone asked to sign, or the reviewer/approver on
   * a stamp request. Nobody else, including other people in the same unit:
   * being a colleague is not a reason to read someone's invoice.
   */
  private async requireVisible(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.ownerId === userId) return doc;

    const asked = await this.prisma.documentSignature.findUnique({
      where: { documentId_signerId: { documentId, signerId: userId } },
      select: { id: true },
    });
    if (asked) return doc;

    const inChain = await this.prisma.stampRequest.findFirst({
      where: { documentId, OR: [{ reviewerId: userId }, { approverId: userId }] },
      select: { id: true },
    });
    if (inChain) return doc;

    // Deliberately the same 404 an unknown id gets: telling someone a document
    // exists but is not theirs is itself a disclosure.
    throw new NotFoundException(`Document ${documentId} not found`);
  }

  private async requireOwner(documentId: string, userId: string, verb: string) {
    const doc = await this.requireVisible(documentId, userId);
    if (doc.ownerId !== userId) {
      throw new ForbiddenException(`Only the person who brought this document in can ${verb} it.`);
    }
    return doc;
  }

  private async requirePersonalIdentity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { personEntityId: true, username: true, displayName: true },
    });
    if (!user?.personEntityId) {
      throw new UnprocessableEntityException(
        'You do not have a personal signing identity yet. Your login must be linked to a verified person before you can sign.',
      );
    }
    return { entityId: user.personEntityId };
  }

  private async audit(event: AuditEvent, userId: string, detail: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { event, userId, detail: detail as any } });
  }
}
