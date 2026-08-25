-- Audit events for the staff document and stamp-request workflow.
--
-- Isolated on purpose. Prisma runs a migration containing ALTER TYPE ... ADD
-- VALUE non-transactionally, so mixing enum additions with any DML leaves
-- partially-committed state behind when something fails mid-way. Nothing else
-- belongs in this file.
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_UPLOADED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SIGNATURE_REQUESTED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SIGNATURE_DECLINED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_RECALLED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'DOCUMENT_REPLACED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'STAMP_REQUESTED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'STAMP_REQUEST_REVIEWED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'STAMP_REQUEST_APPROVED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'STAMP_REQUEST_REJECTED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'STAMP_REQUEST_WITHDRAWN';
