-- ─── Migration 9: Phase 1-B KYC/KYB verification workflow ───────────────────
-- VerificationCase drives the 4-eyes KYC/KYB approval workflow.
-- VerificationEvidence holds uploaded document records with SHA-256 hashes.

-- CreateEnum: VerificationCaseType
CREATE TYPE "VerificationCaseType" AS ENUM ('KYC', 'KYB', 'RE_VERIFICATION');

-- CreateEnum: VerificationCaseStatus
CREATE TYPE "VerificationCaseStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN'
);

-- CreateEnum: CasePriority
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum: EvidenceDocumentType
CREATE TYPE "EvidenceDocumentType" AS ENUM (
  'PASSPORT',
  'NATIONAL_ID',
  'DRIVERS_LICENCE',
  'COMPANY_CERTIFICATE',
  'MEMORANDUM_OF_INCORPORATION',
  'TAX_CERTIFICATE',
  'VAT_CERTIFICATE',
  'UTILITY_BILL',
  'BANK_STATEMENT',
  'PROOF_OF_ADDRESS',
  'SHAREHOLDING_REGISTER',
  'RESOLUTION_OF_DIRECTORS',
  'OTHER'
);

-- CreateTable: VerificationCase
CREATE TABLE "VerificationCase" (
    "id"              TEXT                    NOT NULL,
    "entityId"        TEXT                    NOT NULL,
    "caseType"        "VerificationCaseType"  NOT NULL,
    "status"          "VerificationCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "priority"        "CasePriority"          NOT NULL DEFAULT 'NORMAL',
    "createdById"     TEXT                    NOT NULL,
    "reviewedById"    TEXT,
    "approvedById"    TEXT,
    "rejectedById"    TEXT,
    "rejectionReason" TEXT,
    "reviewNotes"     TEXT,
    "dueDate"         TIMESTAMP(3),
    "submittedAt"     TIMESTAMP(3),
    "reviewedAt"      TIMESTAMP(3),
    "approvedAt"      TIMESTAMP(3),
    "rejectedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationCase_entityId_idx"    ON "VerificationCase"("entityId");
CREATE INDEX "VerificationCase_status_idx"      ON "VerificationCase"("status");
CREATE INDEX "VerificationCase_createdById_idx" ON "VerificationCase"("createdById");

-- CreateTable: VerificationEvidence
CREATE TABLE "VerificationEvidence" (
    "id"           TEXT                  NOT NULL,
    "caseId"       TEXT                  NOT NULL,
    "documentType" "EvidenceDocumentType" NOT NULL,
    "filePath"     TEXT                  NOT NULL,
    "fileName"     TEXT                  NOT NULL,
    "fileSize"     INTEGER               NOT NULL,
    "mimeType"     TEXT                  NOT NULL,
    "sha256Hash"   TEXT                  NOT NULL,
    "uploadedById" TEXT                  NOT NULL,
    "verifiedAt"   TIMESTAMP(3),
    "verifiedById" TEXT,
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationEvidence_caseId_idx" ON "VerificationEvidence"("caseId");

-- AddForeignKey: VerificationCase
ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4-eyes: all four user FKs; SET NULL on deactivation preserves case history
ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: VerificationEvidence — CASCADE because evidence lives and dies with the case
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "VerificationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
