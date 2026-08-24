-- ─── Migration 22: organisational structure ──────────────────────────────────
-- The internal shape of a verified ORGANISATION entity: organisation -> division
-- -> department. This is what an institutional stamp is released by.
--
-- Deliberately NOT modelled as Entity rows: a department has no legal existence,
-- no KYB, and must never surface in a verification queue.
--
-- PERMISSION IDS START AT 40. Ids ...032 and ...033 are conditionally claimed by
-- migration 20260803000019 (it inserts signature:* under those ids on a database
-- where the older seed lost the race), so 32-39 are reserved. Allocating ids
-- that another migration might claim is exactly the bug migration 19 repairs.

CREATE TYPE "OrgUnitType" AS ENUM ('ORGANISATION', 'DIVISION', 'DEPARTMENT');

CREATE TABLE "OrgUnit" (
    "id"         TEXT          NOT NULL,
    "entityId"   TEXT          NOT NULL,
    "unitType"   "OrgUnitType" NOT NULL,
    "name"       TEXT          NOT NULL,
    "code"       TEXT,                     -- short label used on the stamp, e.g. 'FIN'
    "parentId"   TEXT,
    "headUserId" TEXT,                     -- HOD / division head; NULL when the seat is vacant
    "isActive"   BOOLEAN       NOT NULL DEFAULT true,
    "createdBy"  TEXT,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgUnit_entityId_idx"          ON "OrgUnit"("entityId");
CREATE INDEX "OrgUnit_parentId_idx"          ON "OrgUnit"("parentId");
CREATE INDEX "OrgUnit_headUserId_idx"        ON "OrgUnit"("headUserId");
CREATE INDEX "OrgUnit_entityId_unitType_idx" ON "OrgUnit"("entityId", "unitType");

-- Structure is evidence: a unit that has stamped anything must not vanish.
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A head who leaves the company empties the seat; it never deletes the unit.
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_headUserId_fkey"
  FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Shape rules enforced by the database, not only by service code ───────────

-- The root is the only unit without a parent, and only the root may be one.
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_root_has_no_parent"
  CHECK (("unitType" = 'ORGANISATION' AND "parentId" IS NULL)
      OR ("unitType" <> 'ORGANISATION' AND "parentId" IS NOT NULL));

-- Exactly one active root per organisation.
CREATE UNIQUE INDEX "OrgUnit_one_active_root_per_entity"
  ON "OrgUnit"("entityId") WHERE ("unitType" = 'ORGANISATION' AND "isActive");

-- Sibling names collide in a UI and on a stamp; keep them unique under a parent.
CREATE UNIQUE INDEX "OrgUnit_unique_name_under_parent"
  ON "OrgUnit"("parentId", lower("name")) WHERE ("parentId" IS NOT NULL AND "isActive");

-- ── Permissions ──────────────────────────────────────────────────────────────

INSERT INTO "Permission" (id, code, name, description, resource, action) VALUES
  ('00000000-0000-0000-0002-000000000040', 'orgunit:create',
   'Create Org Unit', 'Create divisions and departments in the organisation structure', 'orgunit', 'create'),
  ('00000000-0000-0000-0002-000000000041', 'orgunit:read',
   'Read Org Unit', 'Read the organisation structure', 'orgunit', 'read'),
  ('00000000-0000-0000-0002-000000000042', 'orgunit:update',
   'Update Org Unit', 'Rename, move, appoint heads of, or deactivate an organisational unit', 'orgunit', 'update')
ON CONFLICT (code) DO NOTHING;

-- ADMIN administers the structure.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id FROM "Permission"
WHERE code IN ('orgunit:create', 'orgunit:read', 'orgunit:update')
ON CONFLICT DO NOTHING;

-- Everyone else can see it. Approval routing depends on people being able to
-- find their own unit and its head.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.role_id, p.id
FROM (VALUES
  ('00000000-0000-0000-0001-000000000002'),
  ('00000000-0000-0000-0001-000000000003'),
  ('00000000-0000-0000-0001-000000000004'),
  ('00000000-0000-0000-0001-000000000005'),
  ('00000000-0000-0000-0001-000000000006')
) AS r(role_id)
CROSS JOIN "Permission" p
WHERE p.code = 'orgunit:read'
ON CONFLICT DO NOTHING;
