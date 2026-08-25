import { OrgUnitType, StampRequestStatus } from '@prisma/client';

/**
 * Maps domain rows onto the shapes in portal/src/app/staff/staff.models.ts.
 *
 * That file is the contract the S6 screens were built against, and it is
 * deliberately not the database shape: it says "seal", "standing" and
 * "waitingSince" because that is what a person reading a queue thinks about.
 * Keeping the translation in one place is what lets the portal swap its fixture
 * for HttpStaffApi by changing a single line.
 */

export interface PersonDto {
  id: string;
  displayName: string;
  unitName?: string | null;
}

export interface SealRefDto {
  level: 'DEPARTMENT' | 'DIVISION' | 'ORGANISATION';
  unitCode: string | null;
  unitName: string;
  available: boolean;
}

type Userish = {
  id: string;
  username: string;
  displayName: string | null;
  orgUnit?: { name: string } | null;
} | null | undefined;

export function person(u: Userish): PersonDto | null {
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.displayName || u.username,
    unitName: u.orgUnit?.name ?? null,
  };
}

/** Never null where the contract demands a Person — queues would render blanks. */
export function personOrUnknown(u: Userish): PersonDto {
  return person(u) ?? { id: '', displayName: 'Unknown', unitName: null };
}

export function seal(unit: { name: string; code: string | null; unitType: OrgUnitType } | null | undefined): SealRefDto | null {
  if (!unit) return null;
  return {
    level: unit.unitType,
    unitCode: unit.code,
    unitName: unit.name,
    // Pilot scope is the department seal. Division and organisation seals use
    // the same machinery and are shown-but-disabled in the UI rather than
    // hidden, so the ladder above a department is visible from day one.
    available: unit.unitType === OrgUnitType.DEPARTMENT,
  };
}

/** "2 pages · 148 KB · uploaded today 08:52" */
export function meta(doc: { pageCount: number | null; sizeBytes: number; createdAt: Date }): string {
  const parts: string[] = [];
  if (doc.pageCount) parts.push(`${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}`);
  parts.push(formatBytes(doc.sizeBytes));
  parts.push(`uploaded ${formatWhen(doc.createdAt)}`);
  return parts.join(' · ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(at: Date): string {
  const now = new Date();
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toISOString().slice(11, 16);
  return sameDay ? `today ${time}` : `${at.toISOString().slice(0, 10)} ${time}`;
}

/** What the requester should read on a stamp request row. */
export function stampSubtitle(req: {
  status: StampRequestStatus;
  reviewer: { username: string; displayName: string | null } | null;
  approver: { username: string; displayName: string | null } | null;
  rejectionReason: string | null;
}): string {
  const name = (u: { username: string; displayName: string | null } | null) =>
    u ? u.displayName || u.username : 'nobody';

  switch (req.status) {
    case StampRequestStatus.DRAFT:
      return 'Not submitted';
    case StampRequestStatus.AWAITING_REVIEW:
      return `With ${name(req.reviewer)} for review`;
    case StampRequestStatus.AWAITING_APPROVAL:
      return `Reviewed — with ${name(req.approver)} to approve`;
    case StampRequestStatus.STAMPED:
      return `Reviewed by ${name(req.reviewer)} — approved by ${name(req.approver)}`;
    case StampRequestStatus.REJECTED:
      return req.rejectionReason
        ? `Rejected — ${req.rejectionReason}`
        : 'Rejected';
    case StampRequestStatus.WITHDRAWN:
      return 'Withdrawn by the requester';
    default:
      return '';
  }
}
