-- ─── Migration 5: Phase 1-B entity extensions ────────────────────────────────
-- Adds EntityType, EntityStatus enums and new columns to Entity.
-- Adds userId to AuditLog for operator traceability.
-- Adds all Phase 1-B AuditEvent values.
-- No existing data is altered; all new columns are nullable or have safe defaults.

-- CreateEnum: EntityType
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANISATION');

-- CreateEnum: EntityStatus
CREATE TYPE "EntityStatus" AS ENUM (
  'DRAFT',
  'PENDING_VERIFICATION',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
);

-- AlterTable: Entity — add entityType, status, createdBy
ALTER TABLE "Entity"
  ADD COLUMN "entityType" "EntityType"   NOT NULL DEFAULT 'ORGANISATION',
  ADD COLUMN "status"     "EntityStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "createdBy"  TEXT;

-- AlterTable: AuditLog — add userId for Phase 1-B operator traceability
ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;

-- CreateIndex: Entity performance indexes
CREATE INDEX "Entity_entityType_idx" ON "Entity"("entityType");
CREATE INDEX "Entity_status_idx"     ON "Entity"("status");
CREATE INDEX "Entity_createdBy_idx"  ON "Entity"("createdBy");

-- CreateIndex: AuditLog userId
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AlterEnum: AuditEvent — add Phase 1-B events
-- PostgreSQL requires one ADD VALUE statement per value
ALTER TYPE "AuditEvent" ADD VALUE 'ENTITY_STATUS_CHANGED';
ALTER TYPE "AuditEvent" ADD VALUE 'ENTITY_TYPE_SET';
ALTER TYPE "AuditEvent" ADD VALUE 'PROFILE_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PROFILE_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_SUBMITTED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_REVIEWED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_APPROVED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_REJECTED';
ALTER TYPE "AuditEvent" ADD VALUE 'CASE_WITHDRAWN';
ALTER TYPE "AuditEvent" ADD VALUE 'EVIDENCE_UPLOADED';
ALTER TYPE "AuditEvent" ADD VALUE 'EVIDENCE_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'RELATIONSHIP_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'RELATIONSHIP_STATUS_CHANGED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_DEACTIVATED';
ALTER TYPE "AuditEvent" ADD VALUE 'ROLE_ASSIGNED';
ALTER TYPE "AuditEvent" ADD VALUE 'ROLE_REVOKED';
ALTER TYPE "AuditEvent" ADD VALUE 'PERMISSION_CHECK_FAILED';
