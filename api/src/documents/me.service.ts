import { Injectable } from '@nestjs/common';
import { DocumentStanding, SignatureStatus, StampRequestStatus } from '@prisma/client';
import { OrgUnitsService } from '../org-units/org-units.service';
import { PrismaService } from '../prisma/prisma.service';
import { meta, person, personOrUnknown, seal, stampSubtitle } from './staff.presenter';

/**
 * The four feeds a staff member's day is built from.
 *
 * Everything here answers "what about me": what is waiting on me, what have I
 * signed, what have I sent, where are my stamp requests. None of it takes an id
 * — the acting user IS the query.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgUnits: OrgUnitsService,
  ) {}

  /**
   * One merged queue rather than two.
   *
   * A person does not think in terms of "signatures I owe" versus "stamp
   * requests I must act on" — they think about what is waiting on them. Merging
   * them here, sorted oldest-first, is what makes the queue answerable in one
   * pass instead of two screens that each look half-empty.
   */
  async awaiting(userId: string) {
    const [toSign, toReview, toApprove] = await Promise.all([
      this.prisma.documentSignature.findMany({
        where: { signerId: userId, status: SignatureStatus.AWAITING_SIGNATURE },
        include: {
          document: true,
          requestedBy: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        },
      }),
      this.prisma.stampRequest.findMany({
        where: { reviewerId: userId, status: StampRequestStatus.AWAITING_REVIEW },
        include: {
          document: true,
          orgUnit: { select: { name: true, code: true, unitType: true } },
          requester: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        },
      }),
      this.prisma.stampRequest.findMany({
        where: { approverId: userId, status: StampRequestStatus.AWAITING_APPROVAL },
        include: {
          document: true,
          orgUnit: { select: { name: true, code: true, unitType: true } },
          requester: { select: { id: true, username: true, displayName: true, orgUnit: { select: { name: true } } } },
        },
      }),
    ]);

    const items = [
      ...toSign.map((s) => ({
        id: s.id,
        documentId: s.documentId,
        name: s.document.name,
        requester: personOrUnknown(s.requestedBy),
        action: 'SIGN' as const,
        seal: null,
        waitingSince: s.requestedAt.toISOString(),
        meta: meta(s.document),
      })),
      ...toReview.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        name: r.document.name,
        requester: personOrUnknown(r.requester),
        action: 'REVIEW' as const,
        seal: seal(r.orgUnit),
        waitingSince: (r.submittedAt ?? r.createdAt).toISOString(),
        meta: meta(r.document),
      })),
      ...toApprove.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        name: r.document.name,
        requester: personOrUnknown(r.requester),
        action: 'APPROVE' as const,
        seal: seal(r.orgUnit),
        waitingSince: (r.reviewedAt ?? r.submittedAt ?? r.createdAt).toISOString(),
        meta: meta(r.document),
      })),
    ];

    // Oldest first: the thing that has been waiting longest is the thing most
    // likely to be holding someone else up.
    return items.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  }

  /** Everything this person has signed or had stamped, and where it stands. */
  async myDocuments(userId: string) {
    const docs = await this.prisma.document.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { signatures: { some: { signerId: userId, status: SignatureStatus.SIGNED } } },
        ],
        standing: { not: DocumentStanding.DRAFT },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        supersededBy: { select: { name: true } },
        stampRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            orgUnit: { select: { name: true, code: true, unitType: true } },
            stampedDocument: { select: { verificationId: true } },
          },
        },
      },
    });

    return docs.map((d) => {
      const req = d.stampRequests[0];
      const stamped = req?.stampedDocument;
      return {
        id: d.id,
        name: d.name,
        subtitle: this.standingSubtitle(d, stamped?.verificationId ?? null),
        kind: (req ? 'STAMP' : 'SIGNATURE') as 'STAMP' | 'SIGNATURE',
        seal: seal(req?.orgUnit),
        status: d.standing,
        updatedAt: d.updatedAt.toISOString(),
        verificationId: stamped?.verificationId ?? null,
      };
    });
  }

  /** Documents this person sent to other people, and who still owes a signature. */
  async sent(userId: string) {
    const asks = await this.prisma.documentSignature.findMany({
      where: { requestedById: userId },
      orderBy: { requestedAt: 'desc' },
      include: {
        document: true,
        signer: { select: { username: true, displayName: true, email: true } },
      },
    });

    // One row per document, not per person asked — the sender thinks about the
    // document and wants "1 of 2 signed", not two half-rows.
    const byDocument = new Map<string, typeof asks>();
    for (const ask of asks) {
      const list = byDocument.get(ask.documentId) ?? [];
      list.push(ask);
      byDocument.set(ask.documentId, list);
    }

    return Array.from(byDocument.entries()).map(([documentId, group]) => {
      const doc = group[0].document;
      const signed = group.filter((g) => g.status === SignatureStatus.SIGNED).length;
      const declined = group.find((g) => g.status === SignatureStatus.DECLINED);
      const names = group.map((g) => g.signer.email || g.signer.displayName || g.signer.username);

      const status = declined
        ? SignatureStatus.DECLINED
        : signed === group.length
          ? SignatureStatus.SIGNED
          : SignatureStatus.AWAITING_SIGNATURE;

      const subtitle = declined
        ? `Declined by ${declined.signer.displayName || declined.signer.username}`
        : signed === group.length
          ? `To ${names.join(', ')} — all signed`
          : `To ${names.join(', ')} — ${signed} of ${group.length} signed`;

      return {
        id: documentId,
        name: doc.name,
        subtitle,
        kind: 'SIGNATURE' as const,
        seal: null,
        status,
        updatedAt: doc.updatedAt.toISOString(),
        verificationId: null,
      };
    });
  }

  /** This person's own stamp requests, at whatever stage they have reached. */
  async myStampRequests(userId: string) {
    const requests = await this.prisma.stampRequest.findMany({
      where: { requesterId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        document: true,
        orgUnit: { select: { name: true, code: true, unitType: true } },
        reviewer: { select: { username: true, displayName: true } },
        approver: { select: { username: true, displayName: true } },
        stampedDocument: { select: { verificationId: true } },
      },
    });

    return requests.map((r) => ({
      // The stamp-request screen is addressed by request id, and that is what
      // the S6 list navigates with.
      id: r.id,
      name: r.document.name,
      subtitle: stampSubtitle(r),
      kind: 'STAMP' as const,
      seal: seal(r.orgUnit),
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      verificationId: r.stampedDocument?.verificationId ?? null,
    }));
  }

  /** Who signs off for me — the same answer WP-2.3 gives, for the acting user. */
  async approvalChain(userId: string) {
    const chain = await this.orgUnits.approvalChain(userId);
    return {
      unit: chain.unit,
      reviewer: person(chain.reviewer as any),
      approver: person(chain.approver as any),
      canRequestStamp: chain.canRequestStamp,
      blockers: chain.blockers,
    };
  }

  private standingSubtitle(
    doc: { standing: DocumentStanding; recallReason: string | null; supersededBy: { name: string } | null },
    verificationId: string | null,
  ): string {
    switch (doc.standing) {
      case DocumentStanding.STAMPED:
        return verificationId ?? 'Stamped';
      case DocumentStanding.RECALLED:
        // Both facts, when both are true: why it was pulled, and where the
        // corrected version is.
        return [
          doc.recallReason ? `Recalled — ${doc.recallReason}` : 'Recalled',
          doc.supersededBy ? `replaced by ${doc.supersededBy.name}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case DocumentStanding.SUPERSEDED:
        return doc.supersededBy ? `Replaced by ${doc.supersededBy.name}` : 'Replaced';
      default:
        return 'Signed by you';
    }
  }
}
