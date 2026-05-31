-- ─── Migration 13: Add RELATIONSHIP_UPDATED audit event ──────────────────────
-- Wires the RELATIONSHIP_UPDATED event that was documented as a gap in M4.
-- Emitted when PATCH /v1/entity-relationships/:id updates mutable fields.

ALTER TYPE "AuditEvent" ADD VALUE 'RELATIONSHIP_UPDATED';
