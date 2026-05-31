-- ─── Migration 16: signing audit events (isolated enum changes) ──────────────
-- Kept separate from DML/DDL: ALTER TYPE ADD VALUE is run non-transactionally by
-- Prisma, so isolating it avoids leaving a partial migration on failure.
-- IF NOT EXISTS makes re-application safe.

ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_SIGNED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SIGNATURE_VERIFIED';
