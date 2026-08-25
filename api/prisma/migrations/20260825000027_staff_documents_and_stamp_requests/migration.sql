-- Sprints 4 and 5: the staff side of the platform.
--
-- Until now a document was only ever a stamped artifact produced in one call.
-- Staff need the thing before that: a document they own, sign, send to others
-- for signature, recall when it was wrong, and replace with a corrected version
-- — and a stamp that is REQUESTED and travels the reporting line before any key
-- touches it.

-- ── Enums ────────────────────────────────────────────────────────────────────
-- New types, so a plain CREATE TYPE — none of the ALTER TYPE ADD VALUE hazard
-- that forces AuditEvent additions into their own migration.
CREATE TYPE "DocumentStanding" AS ENUM ('DRAFT', 'SIGNED', 'STAMPED', 'SUPERSEDED', 'RECALLED');
CREATE TYPE "SignatureStatus" AS ENUM ('AWAITING_SIGNATURE', 'SIGNED', 'DECLINED');
CREATE TYPE "StampRequestStatus" AS ENUM ('DRAFT', 'AWAITING_REVIEW', 'AWAITING_APPROVAL', 'STAMPED', 'REJECTED', 'WITHDRAWN');

-- ── A signature or a stamp can now be made by a unit's key ───────────────────
-- Same single-holder shape as CertificateRequest: a department stamp is signed
-- with the department's key, and a department is not an Entity.
ALTER TABLE "Signature" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "Signature" ADD COLUMN "orgUnitId" TEXT;
ALTER TABLE "Signature"
  ADD CONSTRAINT "Signature_orgUnitId_fkey" FOREIGN KEY ("orgUnitId")
  REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Signature_orgUnitId_idx" ON "Signature"("orgUnitId");
ALTER TABLE "Signature"
  ADD CONSTRAINT "Signature_single_holder"
  CHECK (NOT ("entityId" IS NOT NULL AND "orgUnitId" IS NOT NULL));

ALTER TABLE "StampedDocument" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "StampedDocument" ADD COLUMN "orgUnitId" TEXT;
ALTER TABLE "StampedDocument"
  ADD CONSTRAINT "StampedDocument_orgUnitId_fkey" FOREIGN KEY ("orgUnitId")
  REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StampedDocument_orgUnitId_idx" ON "StampedDocument"("orgUnitId");
ALTER TABLE "StampedDocument"
  ADD CONSTRAINT "StampedDocument_single_holder"
  CHECK (NOT ("entityId" IS NOT NULL AND "orgUnitId" IS NOT NULL));

-- ── Document ─────────────────────────────────────────────────────────────────
CREATE TABLE "Document" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "mimeType"       TEXT NOT NULL,
    "sizeBytes"      INTEGER NOT NULL,
    "pageCount"      INTEGER,
    "contentHash"    TEXT NOT NULL,
    "storagePath"    TEXT NOT NULL,
    "ownerId"        TEXT NOT NULL,
    "standing"       "DocumentStanding" NOT NULL DEFAULT 'DRAFT',
    -- Recall withdraws ONE document. It is not revocation: the key that signed
    -- it keeps working, and everything else that key signed stays valid.
    "recalledAt"     TIMESTAMP(3),
    "recalledById"   TEXT,
    "recallReason"   TEXT,
    -- The corrected version that replaces this one. Whoever verifies the old
    -- document is told where the current one is instead of being left guessing.
    "supersededById" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Document_supersededById_key" ON "Document"("supersededById");
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");
CREATE INDEX "Document_standing_idx" ON "Document"("standing");

ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_recalledById_fkey"
  FOREIGN KEY ("recalledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A recalled document must say why and when. Half a recall is worse than none:
-- a recipient who is told a document is withdrawn but not why cannot act on it.
ALTER TABLE "Document" ADD CONSTRAINT "Document_recall_is_complete"
  CHECK (
    ("standing" <> 'RECALLED')
    OR ("recalledAt" IS NOT NULL AND "recalledById" IS NOT NULL AND "recallReason" IS NOT NULL)
  );

-- ── DocumentSignature ────────────────────────────────────────────────────────
-- Covers both halves of WP-4.1/4.2: signing your own document (requestedById
-- null) and being asked to sign someone else's.
CREATE TABLE "DocumentSignature" (
    "id"            TEXT NOT NULL,
    "documentId"    TEXT NOT NULL,
    "signerId"      TEXT NOT NULL,
    "status"        "SignatureStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    "signatureId"   TEXT,
    "certSerial"    TEXT,
    "requestedById" TEXT,
    "note"          TEXT,
    "requestedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt"      TIMESTAMP(3),
    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

-- One ask per person per document: asking twice is a reminder, not a second
-- obligation, and two rows would make "who still owes a signature" ambiguous.
CREATE UNIQUE INDEX "DocumentSignature_documentId_signerId_key"
  ON "DocumentSignature"("documentId", "signerId");
CREATE UNIQUE INDEX "DocumentSignature_signatureId_key" ON "DocumentSignature"("signatureId");
CREATE INDEX "DocumentSignature_signerId_status_idx" ON "DocumentSignature"("signerId", "status");

ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_signerId_fkey"
  FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_signatureId_fkey"
  FOREIGN KEY ("signatureId") REFERENCES "Signature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── StampRequest ─────────────────────────────────────────────────────────────
-- The machinery that replaces stamping on the spot. Deliberately shaped like
-- VerificationCase, which already works: distinct actors recorded per decision,
-- and the reason kept on a rejection.
CREATE TABLE "StampRequest" (
    "id"                TEXT NOT NULL,
    "documentId"        TEXT NOT NULL,
    "orgUnitId"         TEXT NOT NULL,
    "requesterId"       TEXT NOT NULL,
    -- Resolved from the reporting line when the request is submitted, and then
    -- held. Someone who changes department mid-approval must not silently
    -- change who is allowed to decide on a request already in flight.
    "reviewerId"        TEXT,
    "approverId"        TEXT,
    "status"            "StampRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt"       TIMESTAMP(3),
    "reviewedAt"        TIMESTAMP(3),
    "reviewedById"      TEXT,
    "reviewNote"        TEXT,
    "approvedAt"        TIMESTAMP(3),
    "approvedById"      TEXT,
    "approvalNote"      TEXT,
    "rejectedAt"        TIMESTAMP(3),
    "rejectedById"      TEXT,
    "rejectionReason"   TEXT,
    "withdrawnAt"       TIMESTAMP(3),
    "stampedDocumentId" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StampRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StampRequest_stampedDocumentId_key" ON "StampRequest"("stampedDocumentId");
CREATE INDEX "StampRequest_documentId_idx" ON "StampRequest"("documentId");
CREATE INDEX "StampRequest_orgUnitId_status_idx" ON "StampRequest"("orgUnitId", "status");
CREATE INDEX "StampRequest_requesterId_idx" ON "StampRequest"("requesterId");
CREATE INDEX "StampRequest_reviewerId_status_idx" ON "StampRequest"("reviewerId", "status");
CREATE INDEX "StampRequest_approverId_status_idx" ON "StampRequest"("approverId", "status");

-- One live request per document. Two people chasing the same seal on the same
-- file is how a document ends up stamped twice, with two verification ids and
-- no way to say which one is the document of record.
CREATE UNIQUE INDEX "StampRequest_one_open_per_document"
  ON "StampRequest"("documentId")
  WHERE "status" IN ('DRAFT', 'AWAITING_REVIEW', 'AWAITING_APPROVAL');

-- A rejection must carry its reason. "Rejected" with no reason sends the
-- requester back to a screen that cannot tell them what to fix.
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_rejection_has_reason"
  CHECK (("status" <> 'REJECTED') OR ("rejectionReason" IS NOT NULL AND "rejectedById" IS NOT NULL));

ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_orgUnitId_fkey"
  FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StampRequest" ADD CONSTRAINT "StampRequest_stampedDocumentId_fkey"
  FOREIGN KEY ("stampedDocumentId") REFERENCES "StampedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Permissions ──────────────────────────────────────────────────────────────
-- Ids allocated from ...050, leaving 043-049 free. Two migrations claiming one
-- id is what silently disabled /v1/objects for every role once already.
--
-- These are CAPABILITIES, not authority. Holding stamp:review does not let you
-- review any request — it lets you review the requests where the org chart says
-- you are the requester's line manager. The chart decides who; the permission
-- decides whether the person may take part at all.
INSERT INTO "Permission" ("id", "code", "name", "description", "resource", "action") VALUES
  ('00000000-0000-0000-0002-000000000050', 'document:create', 'Upload a document', 'Bring a document onto the platform', 'document', 'create'),
  ('00000000-0000-0000-0002-000000000051', 'document:read',   'Read documents',    'See documents you own or were asked to act on', 'document', 'read'),
  ('00000000-0000-0000-0002-000000000052', 'document:sign',   'Sign a document',   'Sign with your own personal key', 'document', 'sign'),
  ('00000000-0000-0000-0002-000000000053', 'stamp:request',   'Request a stamp',   'Ask for your unit''s seal on a document', 'stamp', 'request'),
  ('00000000-0000-0000-0002-000000000054', 'stamp:review',    'Review a stamp request', 'Review requests from your own reports', 'stamp', 'review'),
  ('00000000-0000-0000-0002-000000000055', 'stamp:approve',   'Approve a stamp request', 'Release your unit''s seal', 'stamp', 'approve')
ON CONFLICT ("code") DO NOTHING;

-- Every employee holds this. Review and approval authority still comes from the
-- reporting line, so granting it to everyone is safe: it says "may take part in
-- stamping", not "may approve anything".
INSERT INTO "Role" ("id", "code", "name", "description", "isSystem", "createdAt") VALUES
  ('00000000-0000-0000-0001-000000000007', 'STAFF', 'Staff', 'Every employee: sign documents, ask for signatures, request the unit seal, and act on what the reporting line puts in front of them.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000007', p.id
FROM "Permission" p
WHERE p.code IN ('document:create','document:read','document:sign','stamp:request','stamp:review','stamp:approve')
ON CONFLICT DO NOTHING;

-- The administrator can drive the whole flow, as for every other feature.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r, "Permission" p
WHERE r.code = 'ADMIN'
  AND p.code IN ('document:create','document:read','document:sign','stamp:request','stamp:review','stamp:approve')
ON CONFLICT DO NOTHING;
