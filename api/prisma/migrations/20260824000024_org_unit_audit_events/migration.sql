-- ─── Migration 24: org structure audit events ────────────────────────────────
-- Isolated from DDL/DML: ALTER TYPE ADD VALUE runs non-transactionally under
-- Prisma, so keeping it alone avoids leaving a partial migration on failure.

ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'ORG_UNIT_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'ORG_UNIT_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'ORG_UNIT_DEACTIVATED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'ORG_UNIT_HEAD_CHANGED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'USER_PLACEMENT_CHANGED';
