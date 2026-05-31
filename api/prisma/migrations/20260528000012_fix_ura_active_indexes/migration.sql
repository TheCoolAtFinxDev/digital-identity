-- ─── Migration 12: Fix UserRoleAssignment unique indexes ──────────────────────
-- M1 partial unique indexes did not filter by isActive, which means that once
-- a role assignment was revoked (isActive = false) it could never be reassigned
-- because the unique constraint still covered the inactive row.
-- Replacing both indexes with versions that only apply to active assignments.

DROP INDEX "URA_global_unique";
DROP INDEX "URA_scoped_unique";

CREATE UNIQUE INDEX "URA_global_unique"
  ON "UserRoleAssignment"("userId", "roleId")
  WHERE "scopeId" IS NULL AND "isActive" = true;

CREATE UNIQUE INDEX "URA_scoped_unique"
  ON "UserRoleAssignment"("userId", "roleId", "scopeId")
  WHERE "scopeId" IS NOT NULL AND "isActive" = true;
