-- ─── Migration 21: F4 lifecycle + F5 stamping audit events ───────────────────
-- Isolated from DDL/DML on purpose: ALTER TYPE ADD VALUE is run
-- non-transactionally by Prisma, so keeping it alone avoids leaving a partial
-- migration behind on failure. IF NOT EXISTS makes re-application safe.

ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'CERTIFICATE_RENEWED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'CERTIFICATE_EXPIRING';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_STAMPED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_VERIFIED';
