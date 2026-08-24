/**
 * The staff-side domain, as the UI needs it.
 *
 * This file is the CONTRACT. The screens are built against these shapes, a
 * fixture implementation backs them today, and the S4/S5 endpoints are expected
 * to return exactly this. Change a shape here and both sides move together.
 */

/** How far up the organisation a seal was released. */
export type SealLevel = 'DEPARTMENT' | 'DIVISION' | 'ORGANISATION';

/** What the platform is waiting for a person to do. */
export type PendingAction = 'SIGN' | 'REVIEW' | 'APPROVE';

export type StampRequestStatus =
  | 'DRAFT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'STAMPED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type SignatureStatus = 'AWAITING_SIGNATURE' | 'SIGNED' | 'DECLINED';

/** Where a finished document currently stands. */
export type DocumentStanding = 'SIGNED' | 'STAMPED' | 'SUPERSEDED' | 'RECALLED';

export interface Person {
  id: string;
  displayName: string;
  /** "Finance", "Technology Division" — shown under a name in queues. */
  unitName?: string | null;
}

export interface SealRef {
  level: SealLevel;
  /** Short code rendered onto the stamp, e.g. FIN. */
  unitCode: string | null;
  unitName: string;
  /** False for levels the platform cannot release yet (division, organisation). */
  available: boolean;
}

/** A row in any of the document lists. */
export interface DocumentSummary {
  id: string;
  name: string;
  /** One line of context — who sent it, what replaced it, why it was recalled. */
  subtitle: string;
  kind: 'SIGNATURE' | 'STAMP';
  seal: SealRef | null;
  /** Domain token; StaffStatusBadge maps it to a colour and a label. */
  status: StampRequestStatus | SignatureStatus | DocumentStanding;
  updatedAt: string;
  verificationId: string | null;
}

/**
 * One entry in the merged "awaiting me" feed.
 *
 * Deliberately one feed rather than two: a person does not think in terms of
 * "signatures I owe" versus "stamp requests I must review" — they think about
 * what is waiting on them.
 */
export interface WorkItem {
  id: string;
  documentId: string;
  name: string;
  requester: Person;
  action: PendingAction;
  seal: SealRef | null;
  /** ISO timestamp; the UI derives the age and flags anything stale. */
  waitingSince: string;
  /** "2 pages · 148 KB · uploaded today 08:52" */
  meta: string;
}

export type StepState = 'DONE' | 'CURRENT' | 'PENDING' | 'FAILED';

export interface ApprovalStep {
  /** REQUESTER -> REVIEWER -> APPROVER -> SEAL */
  role: 'REQUESTER' | 'REVIEWER' | 'APPROVER' | 'SEAL';
  /** "Reviews — your line manager". Server-side because the wording depends on the chart. */
  roleLabel: string;
  actor: Person | null;
  state: StepState;
  at: string | null;
  note: string | null;
}

/** Answered before a request is raised — mirrors GET /v1/users/:id/approval-chain. */
export interface ApprovalChainPreview {
  unit: { id: string; name: string; unitType: string; code: string | null } | null;
  reviewer: Person | null;
  approver: Person | null;
  canRequestStamp: boolean;
  blockers: string[];
}

export interface StampRequest {
  id: string;
  documentId: string;
  documentName: string;
  pageCount: number;
  sizeBytes: number;
  uploadedAt: string;
  seal: SealRef;
  status: StampRequestStatus;
  chain: ApprovalStep[];
  verificationId: string | null;
  stampedAt: string | null;
  rejectionReason: string | null;
}

export interface TrailEntry {
  actor: Person;
  /** "Reviewed as line manager", "Approved as Head of Finance" */
  what: string;
  at: string;
  outcome: 'SIGNED' | 'REVIEWED' | 'APPROVED' | 'REJECTED' | 'RECALLED' | 'STAMPED';
}

export interface DocumentDetail {
  id: string;
  name: string;
  standing: DocumentStanding;
  pageCount: number;
  sizeBytes: number;
  stampedAt: string | null;
  verificationId: string | null;
  seal: SealRef | null;
  certificate: {
    serial: string;
    holder: string;
    validTo: string;
    isRevoked: boolean;
  } | null;
  contentHash: string | null;
  trail: TrailEntry[];
  canRecall: boolean;
  canReplace: boolean;
  recall: { at: string; by: string; reason: string } | null;
  /** Set when this document has been replaced by a corrected version. */
  supersededBy: { id: string; name: string } | null;
}

export interface DecisionResult {
  status: StampRequestStatus;
  message: string;
}
