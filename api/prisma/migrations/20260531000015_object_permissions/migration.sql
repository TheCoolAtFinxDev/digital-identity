-- Migration 15: Add object permissions
-- Object routes pre-date the Phase 1-B RBAC vocabulary. Add explicit
-- permissions instead of overloading entity permissions.

INSERT INTO "Permission" (id, code, name, description, resource, action)
VALUES
  ('00000000-0000-0000-0002-000000000024', 'object:create',
   'Create Object', 'Register a new digital object record', 'object', 'create'),
  ('00000000-0000-0000-0002-000000000025', 'object:read',
   'Read Object', 'Read digital object records', 'object', 'read')
ON CONFLICT (code) DO NOTHING;

-- ADMIN: object permissions
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id
FROM "Permission"
WHERE code IN ('object:create', 'object:read')
ON CONFLICT DO NOTHING;

-- ISO_OPERATOR: creates and reads object identity records during onboarding.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000002', id
FROM "Permission"
WHERE code IN ('object:create', 'object:read')
ON CONFLICT DO NOTHING;

-- Read-only object access for review, approval, certificate, and audit roles.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role_id, permission_id
FROM (
  VALUES
    ('00000000-0000-0000-0001-000000000003',
     '00000000-0000-0000-0002-000000000025'),
    ('00000000-0000-0000-0001-000000000004',
     '00000000-0000-0000-0002-000000000025'),
    ('00000000-0000-0000-0001-000000000005',
     '00000000-0000-0000-0002-000000000025'),
    ('00000000-0000-0000-0001-000000000006',
     '00000000-0000-0000-0002-000000000025')
) AS grants(role_id, permission_id)
ON CONFLICT DO NOTHING;
