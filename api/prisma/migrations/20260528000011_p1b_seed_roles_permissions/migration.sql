-- ─── Migration 11: Phase 1-B seed — roles and permissions ────────────────────
-- Inserts the six initial system roles and all 23 permission codes.
-- Uses fixed UUIDs (0001-prefix = roles, 0002-prefix = permissions) so the
-- seed is deterministic and idempotent across environments.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

-- ── Roles ─────────────────────────────────────────────────────────────────────

INSERT INTO "Role" (id, code, name, description, "isSystem", "createdAt")
VALUES
  ('00000000-0000-0000-0001-000000000001',
   'ADMIN',
   'System Administrator',
   'Full system access — manages users, roles, and all platform resources',
   true, NOW()),

  ('00000000-0000-0000-0001-000000000002',
   'ISO_OPERATOR',
   'ISO Operator',
   'Identity System Operator — onboards legal entities and manages verification cases',
   true, NOW()),

  ('00000000-0000-0000-0001-000000000003',
   'ISO_REVIEWER',
   'ISO Reviewer',
   'Reviews submitted verification cases and provides first-level recommendation',
   true, NOW()),

  ('00000000-0000-0000-0001-000000000004',
   'ISO_APPROVER',
   'ISO Approver',
   'Provides final approval on verification cases under the 4-eyes principle',
   true, NOW()),

  ('00000000-0000-0000-0001-000000000005',
   'CERT_MANAGER',
   'Certificate Manager',
   'Manages certificate issuance and revocation for approved entities',
   true, NOW()),

  ('00000000-0000-0000-0001-000000000006',
   'AUDITOR',
   'Auditor',
   'Read-only access to all records for audit and compliance purposes',
   true, NOW())

ON CONFLICT (code) DO NOTHING;

-- ── Permissions ───────────────────────────────────────────────────────────────

INSERT INTO "Permission" (id, code, name, description, resource, action)
VALUES
  -- Entity management
  ('00000000-0000-0000-0002-000000000001', 'entity:create',
   'Create Entity', 'Register a new legal entity record', 'entity', 'create'),

  ('00000000-0000-0000-0002-000000000002', 'entity:read',
   'Read Entity', 'Read entity details and profiles', 'entity', 'read'),

  ('00000000-0000-0000-0002-000000000003', 'entity:update',
   'Update Entity', 'Update entity fields and profiles', 'entity', 'update'),

  ('00000000-0000-0000-0002-000000000004', 'entity:onboard',
   'Onboard Entity', 'Create and manage KYC/KYB verification cases', 'entity', 'onboard'),

  ('00000000-0000-0000-0002-000000000005', 'entity:review',
   'Review Verification Case', 'Review a submitted verification case (first level)', 'entity', 'review'),

  ('00000000-0000-0000-0002-000000000006', 'entity:approve',
   'Approve Verification Case', 'Give final approval to a verification case (second level)', 'entity', 'approve'),

  ('00000000-0000-0000-0002-000000000007', 'entity:reject',
   'Reject Verification Case', 'Reject a verification case at any review stage', 'entity', 'reject'),

  ('00000000-0000-0000-0002-000000000008', 'entity:suspend',
   'Suspend Entity', 'Suspend a previously approved entity', 'entity', 'suspend'),

  -- Certificate management
  ('00000000-0000-0000-0002-000000000009', 'cert:request',
   'Request Certificate', 'Submit a certificate signing request (CSR)', 'certificate', 'create'),

  ('00000000-0000-0000-0002-000000000010', 'cert:issue',
   'Issue Certificate', 'Issue a certificate for an approved entity', 'certificate', 'issue'),

  ('00000000-0000-0000-0002-000000000011', 'cert:revoke',
   'Revoke Certificate', 'Revoke an issued certificate', 'certificate', 'revoke'),

  ('00000000-0000-0000-0002-000000000012', 'cert:read',
   'Read Certificate', 'Read certificate details and status', 'certificate', 'read'),

  -- Relationship management
  ('00000000-0000-0000-0002-000000000013', 'relationship:create',
   'Create Relationship', 'Create entity-to-entity relationships', 'relationship', 'create'),

  ('00000000-0000-0000-0002-000000000014', 'relationship:read',
   'Read Relationship', 'Read entity-to-entity relationships', 'relationship', 'read'),

  ('00000000-0000-0000-0002-000000000015', 'relationship:update',
   'Update Relationship', 'Update relationship details and notes', 'relationship', 'update'),

  ('00000000-0000-0000-0002-000000000016', 'relationship:deactivate',
   'Deactivate Relationship', 'Set an entity relationship to INACTIVE', 'relationship', 'deactivate'),

  -- User management
  ('00000000-0000-0000-0002-000000000017', 'user:create',
   'Create User', 'Create new operator user accounts', 'user', 'create'),

  ('00000000-0000-0000-0002-000000000018', 'user:read',
   'Read User', 'Read user details and role assignments', 'user', 'read'),

  ('00000000-0000-0000-0002-000000000019', 'user:update',
   'Update User', 'Update user display name and email', 'user', 'update'),

  ('00000000-0000-0000-0002-000000000020', 'user:deactivate',
   'Deactivate User', 'Deactivate a user account', 'user', 'deactivate'),

  ('00000000-0000-0000-0002-000000000021', 'user:assign-role',
   'Assign Role', 'Assign or revoke roles from user accounts', 'user', 'assign'),

  -- Audit
  ('00000000-0000-0000-0002-000000000022', 'audit:read',
   'Read Audit Log', 'Query audit log entries for compliance and investigation', 'audit', 'read'),

  -- ISO system operations
  ('00000000-0000-0000-0002-000000000023', 'iso:manage',
   'Manage ISO Operations', 'ISO system-level operations and configurations', 'iso', 'manage')

ON CONFLICT (code) DO NOTHING;

-- ── Role-Permission mappings ──────────────────────────────────────────────────

-- ADMIN: all 23 permissions
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000001', id
FROM "Permission"
ON CONFLICT DO NOTHING;

-- ISO_OPERATOR: onboarding and entity management
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000002', id
FROM "Permission"
WHERE code IN (
  'entity:create', 'entity:read', 'entity:update', 'entity:onboard',
  'relationship:create', 'relationship:read',
  'cert:request'
)
ON CONFLICT DO NOTHING;

-- ISO_REVIEWER: first-level review
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000003', id
FROM "Permission"
WHERE code IN (
  'entity:read', 'entity:review',
  'relationship:read',
  'cert:read'
)
ON CONFLICT DO NOTHING;

-- ISO_APPROVER: final approval (4-eyes second party)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000004', id
FROM "Permission"
WHERE code IN (
  'entity:read', 'entity:approve', 'entity:reject', 'entity:suspend',
  'relationship:read',
  'cert:read'
)
ON CONFLICT DO NOTHING;

-- CERT_MANAGER: certificate lifecycle
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000005', id
FROM "Permission"
WHERE code IN (
  'cert:request', 'cert:issue', 'cert:revoke', 'cert:read',
  'entity:read'
)
ON CONFLICT DO NOTHING;

-- AUDITOR: read-only across all resources
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '00000000-0000-0000-0001-000000000006', id
FROM "Permission"
WHERE code IN (
  'entity:read', 'cert:read', 'audit:read',
  'relationship:read', 'user:read'
)
ON CONFLICT DO NOTHING;
