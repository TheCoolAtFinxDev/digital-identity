-- ─── Migration 15: F1 Signing & Verification (table + permissions) ───────────
-- Records every signature produced with an entity key (the non-repudiation log)
-- and adds the signature permissions. Idempotent so a re-run is safe.
-- NOTE: the AuditEvent enum values live in migration 16 — enum ADD VALUE must be
-- isolated from DML (Prisma runs such migrations non-transactionally).

CREATE TABLE IF NOT EXISTS "Signature" (
    "id"           TEXT         NOT NULL,
    "entityId"     TEXT         NOT NULL,
    "certSerial"   TEXT         NOT NULL,
    "hashAlg"      TEXT         NOT NULL DEFAULT 'SHA-256',
    "payloadHash"  TEXT         NOT NULL,   -- hex SHA-256 of the signed content
    "signatureB64" TEXT         NOT NULL,   -- base64 signature bytes
    "mechanism"    TEXT         NOT NULL DEFAULT 'SHA256-RSA-PKCS',
    "documentName" TEXT,
    "signedById"   TEXT,                    -- operator/service that invoked signing
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Signature_entityId_idx"   ON "Signature"("entityId");
CREATE INDEX IF NOT EXISTS "Signature_certSerial_idx" ON "Signature"("certSerial");

DO $$ BEGIN
  ALTER TABLE "Signature" ADD CONSTRAINT "Signature_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Permissions (idempotent: ON CONFLICT covers both pkey and code) ──────────
INSERT INTO "Permission" (id, code, name, description, resource, action) VALUES
  ('00000000-0000-0000-0002-000000000024', 'signature:create',
   'Create Signature', 'Sign content with an entity HSM-held key', 'signature', 'create'),
  ('00000000-0000-0000-0002-000000000025', 'signature:read',
   'Verify Signature', 'Verify signatures and read signature records', 'signature', 'read')
ON CONFLICT DO NOTHING;

-- ADMIN gets both (new perms are NOT auto-granted to ADMIN — map explicitly)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id FROM "Permission"
WHERE code IN ('signature:create', 'signature:read')
ON CONFLICT DO NOTHING;

-- CERT_MANAGER may sign
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000005', id FROM "Permission"
WHERE code = 'signature:create'
ON CONFLICT DO NOTHING;

-- AUDITOR may verify/read
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000006', id FROM "Permission"
WHERE code = 'signature:read'
ON CONFLICT DO NOTHING;
