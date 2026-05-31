-- ─── Migration 7: Phase 1-B RBAC tables ──────────────────────────────────────
-- Role, Permission, RolePermission, UserRoleAssignment.
-- Roles and permissions are seeded in migration 11.

-- CreateEnum: RoleScope
CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'ORGANISATION', 'ENTITY', 'DEPARTMENT');

-- CreateTable: Role
CREATE TABLE "Role" (
    "id"          TEXT         NOT NULL,
    "code"        TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "isSystem"    BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateTable: Permission
CREATE TABLE "Permission" (
    "id"          TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "resource"    TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateTable: RolePermission  (composite PK prevents duplicates)
CREATE TABLE "RolePermission" (
    "roleId"       TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

-- CreateTable: UserRoleAssignment
CREATE TABLE "UserRoleAssignment" (
    "id"         TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "roleId"     TEXT         NOT NULL,
    "scope"      "RoleScope"  NOT NULL DEFAULT 'GLOBAL',
    "scopeId"    TEXT,
    "assignedBy" TEXT         NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3),
    "isActive"   BOOLEAN      NOT NULL DEFAULT true,
    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- Partial unique indexes handle NULL scopeId correctly in PostgreSQL.
-- Standard UNIQUE constraints treat NULL != NULL, so two GLOBAL rows for the
-- same (userId, roleId) would not be caught.  Partial indexes fix this.
CREATE UNIQUE INDEX "URA_global_unique"
  ON "UserRoleAssignment"("userId", "roleId")
  WHERE "scopeId" IS NULL;

CREATE UNIQUE INDEX "URA_scoped_unique"
  ON "UserRoleAssignment"("userId", "roleId", "scopeId")
  WHERE "scopeId" IS NOT NULL;

CREATE INDEX "URA_userId_isActive_idx"  ON "UserRoleAssignment"("userId", "isActive");
CREATE INDEX "URA_scope_scopeId_idx"    ON "UserRoleAssignment"("scope", "scopeId");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
