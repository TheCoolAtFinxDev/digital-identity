-- ─── Migration 6: Phase 1-B User model ───────────────────────────────────────
-- Introduces the multi-user operator model.
-- The existing env-var admin will be seeded as a User record at startup (M2).

CREATE TABLE "User" (
    "id"           TEXT         NOT NULL,
    "username"     TEXT         NOT NULL,
    "email"        TEXT         NOT NULL,
    "passwordHash" TEXT         NOT NULL,
    "displayName"  TEXT,
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "createdBy"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");
CREATE INDEX        "User_isActive_idx" ON "User"("isActive");
