-- ─── Migration 19: repair the colliding permission seeds ─────────────────────
-- 20260531000015_object_permissions and 20260531000015_signing_service were
-- authored independently and both claimed Permission ids ...0002-...024 / ...025.
-- Whichever ran second hit ON CONFLICT DO NOTHING and inserted nothing, so one
-- of the two pairs is always missing — and PermissionGuard matches on the
-- permission CODE, so the affected routes return 403 even for ADMIN.
--
--   * deployed database (signing_service applied first): object:create and
--     object:read are missing  -> every /v1/objects route is unreachable.
--   * fresh database (name order puts object_permissions first): signature:create
--     and signature:read are missing -> every /v1/signatures route is unreachable.
--
-- Repair both directions by (re-)creating any of the four codes that is absent,
-- under ids that no earlier migration claims, then re-applying the role grants.
-- Everything keys on `code`, so this is a no-op for whichever pair already won
-- and it is safe to re-run.

INSERT INTO "Permission" (id, code, name, description, resource, action) VALUES
  ('00000000-0000-0000-0002-000000000028', 'object:create',
   'Create Object', 'Register a new digital object record', 'object', 'create'),
  ('00000000-0000-0000-0002-000000000029', 'object:read',
   'Read Object', 'Read digital object records', 'object', 'read'),
  ('00000000-0000-0000-0002-000000000032', 'signature:create',
   'Create Signature', 'Sign content with an entity HSM-held key', 'signature', 'create'),
  ('00000000-0000-0000-0002-000000000033', 'signature:read',
   'Verify Signature', 'Verify signatures and read signature records', 'signature', 'read')
ON CONFLICT (code) DO NOTHING;

-- ── Object grants ────────────────────────────────────────────────────────────
-- ADMIN + ISO_OPERATOR: full object access.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.role_id, p.id
FROM (VALUES
  ('00000000-0000-0000-0001-000000000001'),
  ('00000000-0000-0000-0001-000000000002')
) AS r(role_id)
CROSS JOIN "Permission" p
WHERE p.code IN ('object:create', 'object:read')
ON CONFLICT DO NOTHING;

-- ISO_REVIEWER, ISO_APPROVER, CERT_MANAGER, AUDITOR: read-only.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.role_id, p.id
FROM (VALUES
  ('00000000-0000-0000-0001-000000000003'),
  ('00000000-0000-0000-0001-000000000004'),
  ('00000000-0000-0000-0001-000000000005'),
  ('00000000-0000-0000-0001-000000000006')
) AS r(role_id)
CROSS JOIN "Permission" p
WHERE p.code = 'object:read'
ON CONFLICT DO NOTHING;

-- ── Signature grants (same mapping migration 15 intended) ────────────────────
-- ADMIN: both.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id FROM "Permission"
WHERE code IN ('signature:create', 'signature:read')
ON CONFLICT DO NOTHING;

-- CERT_MANAGER may sign.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000005', id FROM "Permission"
WHERE code = 'signature:create'
ON CONFLICT DO NOTHING;

-- AUDITOR may verify / read signature records.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000006', id FROM "Permission"
WHERE code = 'signature:read'
ON CONFLICT DO NOTHING;
