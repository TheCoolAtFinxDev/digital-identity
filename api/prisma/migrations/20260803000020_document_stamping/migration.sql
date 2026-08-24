-- ─── Migration 20: F5 Document Stamping (table + permissions) ────────────────
-- One row per stamped artifact, binding the signed bytes (originalHash) to the
-- Signature record that proves who signed them and to the certificate whose
-- revocation/expiry status decides whether that proof still holds.
-- NOTE: the AuditEvent enum values live in migration 21 — ALTER TYPE ADD VALUE
-- must stay isolated from DDL/DML (Prisma runs those migrations differently).

CREATE TABLE IF NOT EXISTS "StampedDocument" (
    "id"             TEXT         NOT NULL,
    "verificationId" TEXT         NOT NULL,   -- short, QR/human-friendly identifier
    "entityId"       TEXT         NOT NULL,
    "objectId"       TEXT,
    "signatureId"    TEXT         NOT NULL,
    "certSerial"     TEXT         NOT NULL,
    "documentName"   TEXT         NOT NULL,
    "mimeType"       TEXT         NOT NULL,
    "sizeBytes"      INTEGER      NOT NULL,
    "originalHash"   TEXT         NOT NULL,   -- hex SHA-256 of the bytes that were signed
    "stampedHash"    TEXT,                    -- hex SHA-256 of the rendered stamped file
    "visibleStamp"   BOOLEAN      NOT NULL DEFAULT false,
    "pageCount"      INTEGER,
    "storagePath"    TEXT         NOT NULL,
    "stampedById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StampedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StampedDocument_verificationId_key" ON "StampedDocument"("verificationId");
CREATE UNIQUE INDEX IF NOT EXISTS "StampedDocument_signatureId_key"    ON "StampedDocument"("signatureId");
CREATE INDEX IF NOT EXISTS "StampedDocument_entityId_idx"              ON "StampedDocument"("entityId");
CREATE INDEX IF NOT EXISTS "StampedDocument_certSerial_idx"            ON "StampedDocument"("certSerial");
CREATE INDEX IF NOT EXISTS "StampedDocument_createdAt_idx"             ON "StampedDocument"("createdAt" DESC);

-- Stamps are evidence: never cascade-delete them out from under a verification.
DO $$ BEGIN
  ALTER TABLE "StampedDocument" ADD CONSTRAINT "StampedDocument_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StampedDocument" ADD CONSTRAINT "StampedDocument_signatureId_fkey"
    FOREIGN KEY ("signatureId") REFERENCES "Signature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StampedDocument" ADD CONSTRAINT "StampedDocument_objectId_fkey"
    FOREIGN KEY ("objectId") REFERENCES "ObjectRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Permissions ──────────────────────────────────────────────────────────────
-- Public document verification needs no permission by design, so there is no
-- stamp:verify code here.

INSERT INTO "Permission" (id, code, name, description, resource, action) VALUES
  ('00000000-0000-0000-0002-000000000030', 'stamp:create',
   'Stamp Document', 'Apply a digital stamp (signature + visible seal + QR) to a document', 'stamp', 'create'),
  ('00000000-0000-0000-0002-000000000031', 'stamp:read',
   'Read Stamps', 'List stamped documents and download stamped files', 'stamp', 'read')
ON CONFLICT (code) DO NOTHING;

-- ADMIN and CERT_MANAGER may stamp; CERT_MANAGER already holds signature:create.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.role_id, p.id
FROM (VALUES
  ('00000000-0000-0000-0001-000000000001'),
  ('00000000-0000-0000-0001-000000000005')
) AS r(role_id)
CROSS JOIN "Permission" p
WHERE p.code IN ('stamp:create', 'stamp:read')
ON CONFLICT DO NOTHING;

-- ISO_OPERATOR and AUDITOR may read the stamp register.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.role_id, p.id
FROM (VALUES
  ('00000000-0000-0000-0001-000000000002'),
  ('00000000-0000-0000-0001-000000000006')
) AS r(role_id)
CROSS JOIN "Permission" p
WHERE p.code = 'stamp:read'
ON CONFLICT DO NOTHING;
