-- ─── Migration 17: F3 Machine-to-machine access (service accounts) ───────────
-- Service accounts authenticate via OAuth2 client-credentials and carry scoped
-- roles just like users. Idempotent.

CREATE TABLE IF NOT EXISTS "ServiceAccount" (
    "id"          TEXT         NOT NULL,
    "clientId"    TEXT         NOT NULL,
    "secretHash"  TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAccount_clientId_key" ON "ServiceAccount"("clientId");
CREATE INDEX IF NOT EXISTS "ServiceAccount_isActive_idx" ON "ServiceAccount"("isActive");

CREATE TABLE IF NOT EXISTS "ServiceAccountRole" (
    "id"               TEXT         NOT NULL,
    "serviceAccountId" TEXT         NOT NULL,
    "roleId"           TEXT         NOT NULL,
    "scope"            "RoleScope"  NOT NULL DEFAULT 'GLOBAL',
    "scopeId"          TEXT,
    "isActive"         BOOLEAN      NOT NULL DEFAULT true,
    "assignedBy"       TEXT         NOT NULL,
    "assignedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceAccountRole_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceAccountRole_sa_isActive_idx" ON "ServiceAccountRole"("serviceAccountId", "isActive");

DO $$ BEGIN
  ALTER TABLE "ServiceAccountRole" ADD CONSTRAINT "ServiceAccountRole_serviceAccountId_fkey"
    FOREIGN KEY ("serviceAccountId") REFERENCES "ServiceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ServiceAccountRole" ADD CONSTRAINT "ServiceAccountRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Permissions ──────────────────────────────────────────────────────────────
INSERT INTO "Permission" (id, code, name, description, resource, action) VALUES
  ('00000000-0000-0000-0002-000000000026', 'serviceaccount:create',
   'Manage Service Accounts', 'Create, deactivate and assign roles to service accounts', 'serviceaccount', 'create'),
  ('00000000-0000-0000-0002-000000000027', 'serviceaccount:read',
   'Read Service Accounts', 'List and read service accounts', 'serviceaccount', 'read')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id FROM "Permission"
WHERE code IN ('serviceaccount:create', 'serviceaccount:read')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000006', id FROM "Permission"
WHERE code = 'serviceaccount:read'
ON CONFLICT DO NOTHING;
