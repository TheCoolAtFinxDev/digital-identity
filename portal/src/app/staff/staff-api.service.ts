import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  ApprovalChainPreview,
  DecisionResult,
  DocumentDetail,
  DocumentSummary,
  StampRequest,
  StampRequestStatus,
  WorkItem,
} from './staff.models';

/**
 * Everything the staff screens need from the server.
 *
 * Injected abstractly so the screens never know whether they are talking to the
 * API or to fixtures. Today {@link FixtureStaffApi} is bound; when the S4/S5
 * endpoints land, bind {@link HttpStaffApi} instead and nothing in the
 * components changes.
 */
export abstract class StaffApi {
  /** Merged feed: documents to sign AND stamp requests to review or approve. */
  abstract awaitingMe(): Observable<WorkItem[]>;
  abstract myDocuments(): Observable<DocumentSummary[]>;
  abstract sentForSignature(): Observable<DocumentSummary[]>;
  abstract myStampRequests(): Observable<DocumentSummary[]>;

  /** Who would sign off on a stamp request from the current user. */
  abstract approvalChain(): Observable<ApprovalChainPreview>;

  abstract stampRequest(id: string): Observable<StampRequest>;
  abstract submitStampRequest(id: string): Observable<StampRequest>;
  abstract withdrawStampRequest(id: string): Observable<StampRequest>;
  abstract decide(id: string, decision: 'APPROVE' | 'REJECT', note?: string): Observable<DecisionResult>;

  abstract document(id: string): Observable<DocumentDetail>;
  abstract recall(id: string, reason: string): Observable<DocumentDetail>;
}

// ─── HTTP implementation ──────────────────────────────────────────────────────
//
// The routes below are the ones S4/S5 are expected to expose. Not bound yet —
// FixtureStaffApi is what the app uses until those endpoints exist.

@Injectable()
export class HttpStaffApi extends StaffApi {
  constructor(private readonly http: HttpClient) {
    super();
  }

  awaitingMe() { return this.http.get<WorkItem[]>('/v1/me/awaiting'); }
  myDocuments() { return this.http.get<DocumentSummary[]>('/v1/me/documents'); }
  sentForSignature() { return this.http.get<DocumentSummary[]>('/v1/me/sent'); }
  myStampRequests() { return this.http.get<DocumentSummary[]>('/v1/me/stamp-requests'); }
  approvalChain() { return this.http.get<ApprovalChainPreview>('/v1/me/approval-chain'); }

  stampRequest(id: string) { return this.http.get<StampRequest>(`/v1/stamp-requests/${id}`); }
  submitStampRequest(id: string) { return this.http.patch<StampRequest>(`/v1/stamp-requests/${id}/submit`, {}); }
  withdrawStampRequest(id: string) { return this.http.patch<StampRequest>(`/v1/stamp-requests/${id}/withdraw`, {}); }

  decide(id: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    const verb = decision === 'APPROVE' ? 'approve' : 'reject';
    return this.http.patch<DecisionResult>(`/v1/stamp-requests/${id}/${verb}`, { note: note ?? null });
  }

  document(id: string) { return this.http.get<DocumentDetail>(`/v1/documents/${id}`); }
  recall(id: string, reason: string) {
    return this.http.patch<DocumentDetail>(`/v1/documents/${id}/recall`, { reason });
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LAG = 220; // enough to exercise the loading states honestly

const THABO = { id: 'u-thabo', displayName: 'Thabo Mokoena', unitName: 'Finance' };
const PALESA = { id: 'u-palesa', displayName: 'Palesa Khoeli', unitName: 'Finance' };
const LINEO = { id: 'u-lineo', displayName: 'Lineo Ranthithi', unitName: 'Finance' };
const NTHABI = { id: 'u-nthabi', displayName: 'Nthabiseng Molapo', unitName: 'Finance' };

const FIN_SEAL = { level: 'DEPARTMENT' as const, unitCode: 'FIN', unitName: 'Finance', available: true };
const DIV_SEAL = { level: 'DIVISION' as const, unitCode: 'TEC', unitName: 'Technology', available: false };
const ORG_SEAL = { level: 'ORGANISATION' as const, unitCode: null, unitName: 'Econet Telecom Lesotho', available: false };

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/**
 * Stands in for the S4/S5 endpoints so the screens can be built and reviewed
 * before those exist. State is held in memory, so approving something and then
 * navigating back shows the change — enough to walk the flow, not a database.
 */
@Injectable()
export class FixtureStaffApi extends StaffApi {
  private requestState = new Map<string, StampRequest>();
  private recalled = new Set<string>();

  awaitingMe(): Observable<WorkItem[]> {
    return of([
      {
        id: 'w-1', documentId: 'd-4182', name: 'Invoice INV-2026-004182.pdf',
        requester: THABO, action: 'REVIEW' as const, seal: FIN_SEAL,
        waitingSince: hoursAgo(0.4), meta: '2 pages · 148 KB · uploaded today 08:52',
      },
      {
        id: 'w-2', documentId: 'd-0311', name: 'Credit note CN-2026-000311.pdf',
        requester: THABO, action: 'REVIEW' as const, seal: FIN_SEAL,
        waitingSince: hoursAgo(1), meta: '1 page · 96 KB · uploaded today 08:11',
      },
      {
        id: 'w-3', documentId: 'd-fibre', name: 'Supplier statement — Maseru Fibre.pdf',
        requester: NTHABI, action: 'REVIEW' as const, seal: FIN_SEAL,
        waitingSince: hoursAgo(3), meta: '4 pages · 312 KB · uploaded today 06:40',
      },
      {
        id: 'w-4', documentId: 'd-capex', name: 'Q3 network capex proposal.pdf',
        requester: LINEO, action: 'SIGN' as const, seal: null,
        waitingSince: hoursAgo(2), meta: '11 pages · 1.2 MB · uploaded today 07:30',
      },
    ]).pipe(delay(LAG));
  }

  myDocuments(): Observable<DocumentSummary[]> {
    return of([
      {
        id: 'd-4182', name: 'Invoice INV-2026-004182.pdf', subtitle: 'STM-2026-7F41C2A9B0',
        kind: 'STAMP' as const, seal: FIN_SEAL,
        status: this.recalled.has('d-4182') ? ('RECALLED' as const) : ('STAMPED' as const),
        updatedAt: hoursAgo(4), verificationId: 'STM-2026-7F41C2A9B0',
      },
      {
        id: 'd-expense', name: 'Expense claim — August.pdf', subtitle: 'Signed by you',
        kind: 'SIGNATURE' as const, seal: null, status: 'SIGNED' as const,
        updatedAt: daysAgo(1), verificationId: null,
      },
      {
        id: 'd-4096', name: 'Invoice INV-2026-004096.pdf', subtitle: 'Replaced by INV-2026-004182',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'SUPERSEDED' as const,
        updatedAt: daysAgo(3), verificationId: 'STM-2026-1D08E5C3A7',
      },
      {
        id: 'd-po877', name: 'Purchase order PO-2026-00877.pdf', subtitle: 'Recalled by you — wrong VAT rate',
        kind: 'SIGNATURE' as const, seal: null, status: 'RECALLED' as const,
        updatedAt: daysAgo(5), verificationId: null,
      },
    ]).pipe(delay(LAG));
  }

  sentForSignature(): Observable<DocumentSummary[]> {
    return of([
      {
        id: 'd-offer', name: 'Offer letter — M. Letsie.pdf',
        subtitle: 'To mpho.letsie@econet.co.ls — 1 of 2 signed',
        kind: 'SIGNATURE' as const, seal: null, status: 'AWAITING_SIGNATURE' as const,
        updatedAt: hoursAgo(0.7), verificationId: null,
      },
      {
        id: 'd-tsepo', name: 'Service agreement — Tsepo Civils.pdf',
        subtitle: 'To accounts@tsepocivils.co.ls — all signed',
        kind: 'SIGNATURE' as const, seal: null, status: 'SIGNED' as const,
        updatedAt: daysAgo(1), verificationId: null,
      },
      {
        id: 'd-highlands', name: 'Contractor SLA — Highlands IT.pdf',
        subtitle: 'To ops@highlandsit.co.ls',
        kind: 'SIGNATURE' as const, seal: null, status: 'DECLINED' as const,
        updatedAt: daysAgo(2), verificationId: null,
      },
    ]).pipe(delay(LAG));
  }

  myStampRequests(): Observable<DocumentSummary[]> {
    return of([
      {
        id: 'd-4182', name: 'Invoice INV-2026-004182.pdf',
        subtitle: 'Reviewed by Palesa Khoeli — approved by Lineo Ranthithi',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'STAMPED' as const,
        updatedAt: hoursAgo(4), verificationId: 'STM-2026-7F41C2A9B0',
      },
      {
        id: 'd-0311', name: 'Credit note CN-2026-000311.pdf', subtitle: 'With Palesa Khoeli for review',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'AWAITING_REVIEW' as const,
        updatedAt: hoursAgo(1), verificationId: null,
      },
      {
        id: 'd-q3', name: 'Statement of account — Q3.pdf', subtitle: 'Reviewed — with Lineo Ranthithi to approve',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'AWAITING_APPROVAL' as const,
        updatedAt: hoursAgo(4), verificationId: null,
      },
      {
        id: 'd-refund', name: 'Refund authority — A. Sello.pdf',
        subtitle: 'Rejected by Lineo Ranthithi — attach the credit memo',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'REJECTED' as const,
        updatedAt: daysAgo(1), verificationId: null,
      },
      {
        id: 'd-lease', name: 'Maseru depot lease.pdf', subtitle: 'Not submitted',
        kind: 'STAMP' as const, seal: FIN_SEAL, status: 'DRAFT' as const,
        updatedAt: daysAgo(6), verificationId: null,
      },
    ]).pipe(delay(LAG));
  }

  approvalChain(): Observable<ApprovalChainPreview> {
    return of({
      unit: { id: 'ou-fin', name: 'Finance', unitType: 'DEPARTMENT', code: 'FIN' },
      reviewer: PALESA,
      approver: LINEO,
      canRequestStamp: true,
      blockers: [],
    }).pipe(delay(LAG));
  }

  stampRequest(id: string): Observable<StampRequest> {
    const held = this.requestState.get(id);
    if (held) return of(held).pipe(delay(LAG));

    const seeded: Record<string, StampRequestStatusSeed> = {
      'd-4182': 'STAMPED',
      'd-0311': 'AWAITING_REVIEW',
      'd-q3': 'AWAITING_APPROVAL',
      'd-refund': 'REJECTED',
      'd-lease': 'DRAFT',
    };
    const req = this.build(id, seeded[id] ?? 'DRAFT');
    this.requestState.set(id, req);
    return of(req).pipe(delay(LAG));
  }

  submitStampRequest(id: string) { return this.transition(id, 'AWAITING_REVIEW'); }
  withdrawStampRequest(id: string) { return this.transition(id, 'DRAFT'); }

  decide(id: string, decision: 'APPROVE' | 'REJECT', note?: string): Observable<DecisionResult> {
    const current = this.requestState.get(id);
    if (!current) return throwError(() => new Error(`Unknown stamp request ${id}`));

    if (decision === 'REJECT') {
      this.requestState.set(id, this.build(id, 'REJECTED', note));
      return of({ status: 'REJECTED' as const, message: 'Rejected. It goes back to the requester with your note.' }).pipe(delay(LAG));
    }

    const next: StampRequestStatus =
      current.status === 'AWAITING_REVIEW' ? 'AWAITING_APPROVAL' : 'STAMPED';
    this.requestState.set(id, this.build(id, next, note));
    return of({
      status: next,
      message: next === 'STAMPED'
        ? 'Approved. The Finance department seal has been applied and the requester notified.'
        : 'Reviewed. It now sits with Lineo Ranthithi for approval.',
    }).pipe(delay(LAG));
  }

  document(id: string): Observable<DocumentDetail> {
    const isRecalled = this.recalled.has(id);
    return of({
      id,
      name: 'Invoice INV-2026-004182.pdf',
      standing: (isRecalled ? 'RECALLED' : 'STAMPED') as DocumentDetail['standing'],
      pageCount: 2,
      sizeBytes: 155_648,
      stampedAt: hoursAgo(4),
      verificationId: 'STM-2026-7F41C2A9B0',
      seal: FIN_SEAL,
      certificate: {
        serial: '101F',
        holder: 'Finance department key',
        validTo: new Date(Date.now() + 398 * 86_400_000).toISOString(),
        isRevoked: false,
      },
      contentHash: 'a3f1c9e2b7d48f60c1a5e83b29d7f4416ce0b8a92d3f571e8c4b6a0d95e2f183',
      trail: [
        { actor: THABO, what: 'Signed with his personal key, then requested the department seal', at: hoursAgo(4.4), outcome: 'SIGNED' as const },
        { actor: PALESA, what: 'Reviewed as line manager', at: hoursAgo(4.2), outcome: 'REVIEWED' as const },
        { actor: LINEO, what: 'Approved as Head of Finance — released the department seal', at: hoursAgo(4), outcome: 'APPROVED' as const },
        ...(isRecalled
          ? [{ actor: THABO, what: 'Recalled the document — wrong VAT rate applied', at: new Date().toISOString(), outcome: 'RECALLED' as const }]
          : []),
      ],
      canRecall: !isRecalled,
      canReplace: !isRecalled,
      recall: isRecalled ? { at: new Date().toISOString(), by: THABO.displayName, reason: 'Wrong VAT rate applied' } : null,
      supersededBy: null,
    }).pipe(delay(LAG));
  }

  recall(id: string, _reason: string): Observable<DocumentDetail> {
    this.recalled.add(id);
    return this.document(id);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private transition(id: string, status: StampRequestStatusSeed): Observable<StampRequest> {
    const req = this.build(id, status);
    this.requestState.set(id, req);
    return of(req).pipe(delay(LAG));
  }

  private build(id: string, status: StampRequestStatusSeed, note?: string): StampRequest {
    const done = (s: StampRequestStatusSeed[]) => s.includes(status);
    const rejected = status === 'REJECTED';
    const stamped = status === 'STAMPED';

    const chain: StampRequest['chain'] = [
      {
        role: 'REQUESTER', roleLabel: 'Requested — you', actor: THABO,
        state: status === 'DRAFT' ? 'CURRENT' : 'DONE',
        at: status === 'DRAFT' ? null : hoursAgo(4.4),
        note: status === 'DRAFT' ? null : 'Submitted today 08:54',
      },
      {
        role: 'REVIEWER', roleLabel: 'Reviews — your line manager', actor: PALESA,
        state: done(['AWAITING_APPROVAL', 'STAMPED', 'REJECTED']) ? 'DONE'
          : status === 'AWAITING_REVIEW' ? 'CURRENT' : 'PENDING',
        at: done(['AWAITING_APPROVAL', 'STAMPED', 'REJECTED']) ? hoursAgo(4.2) : null,
        note: status === 'AWAITING_REVIEW' ? 'Waiting since 08:54' : null,
      },
      {
        role: 'APPROVER', roleLabel: 'Approves — Head of Finance', actor: LINEO,
        state: stamped ? 'DONE' : rejected ? 'FAILED' : status === 'AWAITING_APPROVAL' ? 'CURRENT' : 'PENDING',
        at: stamped || rejected ? hoursAgo(4) : null,
        note: rejected ? (note || 'Rejected — attach the credit memo before resubmitting') : null,
      },
      {
        role: 'SEAL', roleLabel: 'Applied with the department key', actor: null,
        state: stamped ? 'DONE' : 'PENDING',
        at: stamped ? hoursAgo(4) : null,
        note: stamped ? 'STM-2026-7F41C2A9B0' : null,
      },
    ];

    return {
      id,
      documentId: id,
      documentName: 'Invoice INV-2026-004182.pdf',
      pageCount: 2,
      sizeBytes: 151_552,
      uploadedAt: hoursAgo(4.5),
      seal: FIN_SEAL,
      status,
      chain,
      verificationId: stamped ? 'STM-2026-7F41C2A9B0' : null,
      stampedAt: stamped ? hoursAgo(4) : null,
      rejectionReason: rejected ? (note || 'Attach the credit memo before resubmitting') : null,
    };
  }
}

type StampRequestStatusSeed = StampRequest['status'];

/** The seals a person may pick from. Only the department seal is releasable today. */
export const SEAL_OPTIONS = [FIN_SEAL, DIV_SEAL, ORG_SEAL];
