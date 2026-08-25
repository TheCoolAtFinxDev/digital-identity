import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditEvent, DocumentStanding, OrgUnitType, StampRequestStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrgUnitsService } from '../org-units/org-units.service';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from '../signing/signing.service';
import { PdfStampService } from '../stamping/pdf-stamp.service';
import { StampStorageService } from '../stamping/stamp-storage.service';
import { meta, personOrUnknown, seal } from '../documents/staff.presenter';

/**
 * Request -> manager review -> HOD approval -> stamped.
 *
 * Replaces stamping on the spot. The shape is deliberately the one
 * VerificationCase already proved: each decision records its own actor, and a
 * rejection carries its reason.
 *
 * The four-eyes rule here is NOT a pool of reviewers. It is the requester's own
 * line manager and their unit's head, resolved from the org chart — which is
 * what WP-2.3's approval-chain endpoint already computes, so this asks that
 * rather than reimplementing the rule.
 */
@Injectable()
export class StampRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgUnits: OrgUnitsService,
    private readonly signing: SigningService,
    private readonly pdf: PdfStampService,
    private readonly storage: StampStorageService,
  ) {}

  // ── Raising ────────────────────────────────────────────────────────────────

  async create(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.ownerId !== userId) {
      throw new ForbiddenException('Only the person who brought a document in can ask for a seal on it.');
    }
    if (doc.standing === DocumentStanding.RECALLED) {
      throw new UnprocessableEntityException(`${doc.name} has been recalled.`);
    }

    const chain = await this.orgUnits.approvalChain(userId);
    if (!chain.unit) {
      throw new UnprocessableEntityException(
        'You are not on the org chart yet, so there is no unit whose seal you can ask for.',
      );
    }
    if (chain.unit.unitType !== OrgUnitType.DEPARTMENT) {
      throw new UnprocessableEntityException(
        `Only a department seal can be released in the pilot. You sit in ${chain.unit.name}, which is a ${chain.unit.unitType.toLowerCase()}.`,
      );
    }

    const open = await this.prisma.stampRequest.findFirst({
      where: {
        documentId,
        status: { in: [StampRequestStatus.DRAFT, StampRequestStatus.AWAITING_REVIEW, StampRequestStatus.AWAITING_APPROVAL] },
      },
    });
    if (open) {
      throw new UnprocessableEntityException(
        `There is already an open stamp request for ${doc.name}. Withdraw it before raising another.`,
      );
    }

    const request = await this.prisma.stampRequest.create({
      data: {
        id: randomUUID(),
        documentId,
        orgUnitId: chain.unit.id,
        requesterId: userId,
        status: StampRequestStatus.DRAFT,
      },
    });

    await this.audit(AuditEvent.STAMP_REQUESTED, userId, {
      stampRequestId: request.id, documentId, orgUnitId: chain.unit.id, status: 'DRAFT',
    });

    return this.get(request.id, userId);
  }

  /**
   * Submit for review. The reporting line is resolved HERE and then held.
   *
   * Resolving once at submit time is deliberate: if the chain were re-read at
   * each decision, someone changing department mid-approval would silently move
   * a request already in flight to a different reviewer, and nobody would be
   * able to say afterwards who was supposed to have looked at it.
   */
  async submit(id: string, userId: string) {
    const request = await this.require(id, userId);
    if (request.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can submit this request.');
    }
    if (request.status !== StampRequestStatus.DRAFT) {
      throw new UnprocessableEntityException(`This request is already ${request.status.replace(/_/g, ' ').toLowerCase()}.`);
    }

    const chain = await this.orgUnits.approvalChain(userId);
    if (!chain.canRequestStamp) {
      throw new UnprocessableEntityException(
        `This request cannot be routed yet: ${chain.blockers.join('; ')}`,
      );
    }

    const updated = await this.prisma.stampRequest.update({
      where: { id },
      data: {
        status: StampRequestStatus.AWAITING_REVIEW,
        submittedAt: new Date(),
        reviewerId: chain.reviewer!.id,
        approverId: chain.approver!.id,
      },
    });

    await this.audit(AuditEvent.STAMP_REQUESTED, userId, {
      stampRequestId: id, documentId: updated.documentId,
      reviewerId: chain.reviewer!.id, approverId: chain.approver!.id,
      status: 'AWAITING_REVIEW',
    });

    return this.get(id, userId);
  }

  async withdraw(id: string, userId: string) {
    const request = await this.require(id, userId);
    if (request.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can withdraw this request.');
    }
    const open: StampRequestStatus[] = [
      StampRequestStatus.DRAFT,
      StampRequestStatus.AWAITING_REVIEW,
      StampRequestStatus.AWAITING_APPROVAL,
    ];
    if (!open.includes(request.status)) {
      throw new UnprocessableEntityException('This request has already been decided.');
    }

    await this.prisma.stampRequest.update({
      where: { id },
      data: { status: StampRequestStatus.DRAFT, submittedAt: null, reviewerId: null, approverId: null },
    });

    await this.audit(AuditEvent.STAMP_REQUEST_WITHDRAWN, userId, { stampRequestId: id });
    return this.get(id, userId);
  }

  // ── Deciding ───────────────────────────────────────────────────────────────

  /**
   * Advance the request one step.
   *
   * One verb rather than separate review/approve endpoints, because that is how
   * the queue works: whatever is in front of you, you either move it on or send
   * it back. Which step it takes depends on where the request is and who you
   * are, and both are checked — being the approver does not let you skip the
   * review, and being the reviewer does not let you release the seal.
   */
  async advance(id: string, userId: string, note?: string) {
    const request = await this.require(id, userId);

    if (request.status === StampRequestStatus.AWAITING_REVIEW) {
      if (request.reviewerId !== userId) {
        throw new ForbiddenException(
          'This request is with the requester’s line manager for review, and that is not you.',
        );
      }
      const updated = await this.prisma.stampRequest.update({
        where: { id },
        data: {
          status: StampRequestStatus.AWAITING_APPROVAL,
          reviewedAt: new Date(),
          reviewedById: userId,
          reviewNote: note ?? null,
        },
        include: { approver: { select: { username: true, displayName: true } } },
      });

      await this.audit(AuditEvent.STAMP_REQUEST_REVIEWED, userId, {
        stampRequestId: id, documentId: request.documentId, note: note ?? null,
      });

      const approver = updated.approver;
      return {
        status: StampRequestStatus.AWAITING_APPROVAL,
        message: `Reviewed. It now sits with ${approver ? approver.displayName || approver.username : 'the head of the unit'} for approval.`,
      };
    }

    if (request.status === StampRequestStatus.AWAITING_APPROVAL) {
      if (request.approverId !== userId) {
        throw new ForbiddenException(
          'Only the head of the unit whose seal was asked for can release it.',
        );
      }
      // Four eyes: the head cannot approve their own request. The chart already
      // reports this as a blocker before submission, and it is re-checked here
      // because the head could have changed since.
      if (request.requesterId === userId) {
        throw new ForbiddenException(
          'You raised this request, so you cannot also release the seal on it. Four eyes means two people.',
        );
      }

      const stamped = await this.applySeal(request, userId, note);
      return {
        status: StampRequestStatus.STAMPED,
        message: `Approved. The ${stamped.unitName} seal has been applied and the requester notified.`,
      };
    }

    throw new UnprocessableEntityException(
      `Nothing to do — this request is ${request.status.replace(/_/g, ' ').toLowerCase()}.`,
    );
  }

  async reject(id: string, userId: string, reason?: string) {
    const request = await this.require(id, userId);

    const isReviewer = request.status === StampRequestStatus.AWAITING_REVIEW && request.reviewerId === userId;
    const isApprover = request.status === StampRequestStatus.AWAITING_APPROVAL && request.approverId === userId;
    if (!isReviewer && !isApprover) {
      throw new ForbiddenException('This request is not waiting on you.');
    }

    const rejectionReason = reason?.trim() || 'No reason given';

    await this.prisma.stampRequest.update({
      where: { id },
      data: {
        status: StampRequestStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedById: userId,
        rejectionReason,
      },
    });

    await this.audit(AuditEvent.STAMP_REQUEST_REJECTED, userId, {
      stampRequestId: id, documentId: request.documentId, reason: rejectionReason,
    });

    return {
      status: StampRequestStatus.REJECTED,
      message: 'Rejected. It goes back to the requester with your note.',
    };
  }

  // ── Applying the seal ──────────────────────────────────────────────────────

  /**
   * Approval is what releases the seal — nothing before it touches a key.
   *
   * The visible seal is rendered FIRST and the rendered bytes are what get
   * signed, so the file a recipient holds is exactly what was signed. Signing
   * the input and then drawing on it would produce a document whose own
   * signature does not cover what is printed on it.
   */
  private async applySeal(
    request: { id: string; documentId: string; orgUnitId: string; requesterId: string },
    userId: string,
    note?: string,
  ) {
    const [doc, unit] = await Promise.all([
      this.prisma.document.findUniqueOrThrow({ where: { id: request.documentId } }),
      this.prisma.orgUnit.findUniqueOrThrow({
        where: { id: request.orgUnitId },
        include: { entity: { include: { orgProfile: { select: { legalName: true } } } } },
      }),
    ]);

    const original = await this.storage.read(doc.storagePath);
    const stampId = randomUUID();
    const verificationId = await this.nextVerificationId();
    const stampedAt = new Date();

    let stampedBytes = original;
    let visibleStamp = false;
    let pageCount: number | null = doc.pageCount;

    if (this.pdf.isPdf(original)) {
      try {
        const rendered = await this.pdf.apply(
          original,
          {
            // The seal names the department, because the department is what
            // released it — not the company in general.
            issuerName: `${unit.entity.orgProfile?.legalName || unit.entity.name} — ${unit.name}`,
            verificationId,
            verifyUrl: this.verifyUrl(verificationId),
            stampedAt,
          },
          'LAST',
        );
        stampedBytes = rendered.bytes;
        pageCount = rendered.pageCount;
        visibleStamp = true;
      } catch {
        // Encrypted or malformed PDF — a cryptographic stamp is still worth
        // having, and refusing outright would strand a legitimate document.
      }
    }

    const { record: signature, cert } = await this.signing.signBufferForUnit(
      request.orgUnitId,
      stampedBytes,
      doc.name,
      userId,
    );

    const storagePath = await this.storage.writeStamped(stampId, doc.name, stampedBytes);

    await this.prisma.$transaction(async (tx) => {
      const stampedDoc = await tx.stampedDocument.create({
        data: {
          id: stampId,
          verificationId,
          orgUnitId: request.orgUnitId,
          signatureId: signature.id,
          certSerial: cert.serial,
          documentName: doc.name,
          mimeType: doc.mimeType,
          sizeBytes: stampedBytes.length,
          originalHash: doc.contentHash,
          stampedHash: signature.payloadHash,
          visibleStamp,
          pageCount,
          storagePath,
          stampedById: userId,
        },
      });

      await tx.stampRequest.update({
        where: { id: request.id },
        data: {
          status: StampRequestStatus.STAMPED,
          approvedAt: new Date(),
          approvedById: userId,
          approvalNote: note ?? null,
          stampedDocumentId: stampedDoc.id,
        },
      });

      await tx.document.update({
        where: { id: doc.id },
        data: { standing: DocumentStanding.STAMPED },
      });
    });

    await this.audit(AuditEvent.STAMP_REQUEST_APPROVED, userId, {
      stampRequestId: request.id, documentId: doc.id, orgUnitId: request.orgUnitId,
      verificationId, certSerial: cert.serial, visibleStamp,
    });
    await this.audit(AuditEvent.DOCUMENT_STAMPED, userId, {
      stampId, verificationId, documentName: doc.name, certSerial: cert.serial,
      signatureId: signature.id, holder: 'ORG_UNIT', orgUnitId: request.orgUnitId,
    });

    return { unitName: unit.name, verificationId };
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /** The StampRequest shape the S6 stepper is built against. */
  async get(id: string, userId: string) {
    const request = await this.require(id, userId);

    const full = await this.prisma.stampRequest.findUniqueOrThrow({
      where: { id },
      include: {
        document: true,
        orgUnit: { select: { name: true, code: true, unitType: true } },
        requester: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        reviewer: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        approver: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        stampedDocument: { select: { verificationId: true, createdAt: true } },
      },
    });

    return {
      id: full.id,
      documentId: full.documentId,
      documentName: full.document.name,
      pageCount: full.document.pageCount ?? 0,
      sizeBytes: full.document.sizeBytes,
      uploadedAt: full.document.createdAt.toISOString(),
      seal: seal(full.orgUnit)!,
      status: full.status,
      chain: this.buildChain(full),
      verificationId: full.stampedDocument?.verificationId ?? null,
      stampedAt: full.stampedDocument?.createdAt?.toISOString() ?? null,
      rejectionReason: full.rejectionReason,
    };
  }

  /**
   * The stepper. Wording is server-side on purpose: "Reviews — your line
   * manager" is only true because of what the chart says, so the label belongs
   * with the thing that knows the chart.
   */
  private buildChain(r: any) {
    const rejectedAtReview = r.status === StampRequestStatus.REJECTED && !r.reviewedAt;
    const rejectedAtApproval = r.status === StampRequestStatus.REJECTED && !!r.reviewedAt;

    const state = (done: boolean, current: boolean, failed = false) =>
      failed ? 'FAILED' : done ? 'DONE' : current ? 'CURRENT' : 'PENDING';

    return [
      {
        role: 'REQUESTER',
        roleLabel: 'Requested the seal',
        actor: personOrUnknown(r.requester),
        state: state(!!r.submittedAt, r.status === StampRequestStatus.DRAFT),
        at: r.submittedAt?.toISOString() ?? null,
        note: null,
      },
      {
        role: 'REVIEWER',
        roleLabel: 'Reviews — your line manager',
        actor: r.reviewer ? personOrUnknown(r.reviewer) : null,
        state: state(!!r.reviewedAt, r.status === StampRequestStatus.AWAITING_REVIEW, rejectedAtReview),
        at: r.reviewedAt?.toISOString() ?? null,
        note: rejectedAtReview ? r.rejectionReason : r.reviewNote,
      },
      {
        role: 'APPROVER',
        roleLabel: `Approves — head of ${r.orgUnit.name}`,
        actor: r.approver ? personOrUnknown(r.approver) : null,
        state: state(!!r.approvedAt, r.status === StampRequestStatus.AWAITING_APPROVAL, rejectedAtApproval),
        at: r.approvedAt?.toISOString() ?? null,
        note: rejectedAtApproval ? r.rejectionReason : r.approvalNote,
      },
      {
        role: 'SEAL',
        roleLabel: `${r.orgUnit.name} seal applied`,
        actor: null,
        state: state(r.status === StampRequestStatus.STAMPED, false),
        at: r.stampedDocument?.createdAt?.toISOString() ?? null,
        note: null,
      },
    ];
  }

  /**
   * Visible to the requester and to the two people the chart put on it. Nobody
   * else — a stamp request carries a document, and being nearby in the org chart
   * is not a reason to read it.
   */
  private async require(id: string, userId: string) {
    const request = await this.prisma.stampRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Stamp request ${id} not found`);

    const involved =
      request.requesterId === userId ||
      request.reviewerId === userId ||
      request.approverId === userId;
    if (!involved) throw new NotFoundException(`Stamp request ${id} not found`);

    return request;
  }

  private async nextVerificationId(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `STM-${year}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const clash = await this.prisma.stampedDocument.findUnique({ where: { verificationId: candidate } });
      if (!clash) return candidate;
    }
    throw new BadRequestException('Could not allocate a verification ID');
  }

  private verifyUrl(verificationId: string): string {
    const base = process.env.PUBLIC_VERIFY_BASE_URL ?? 'http://localhost:8080/v1/verify';
    return `${base}/${verificationId}`;
  }

  private async audit(event: AuditEvent, userId: string, detail: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { event, userId, detail: detail as any } });
  }
}
