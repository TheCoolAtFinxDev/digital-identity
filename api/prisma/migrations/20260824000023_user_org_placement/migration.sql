-- ─── Migration 23: put people on the org chart ───────────────────────────────
-- Three additions to User, all nullable because they do not apply to everyone:
--
--   personEntityId  the verified PERSON entity behind a staff login. This link is
--                   what makes a personal signature attributable to a named,
--                   KYC'd individual rather than to an account. Identity
--                   operators (ADMIN, ISO_*, CERT_MANAGER) have no personal
--                   entity and no personal signing key.
--   orgUnitId       the unit the person works in — decides which department
--                   stamp their requests are routed to.
--   managerId       the line manager, who is the first pair of eyes on a stamp
--                   request. Distinct from the unit's head, who approves.

ALTER TABLE "User" ADD COLUMN "personEntityId" TEXT;
ALTER TABLE "User" ADD COLUMN "orgUnitId"      TEXT;
ALTER TABLE "User" ADD COLUMN "managerId"      TEXT;

-- One login per verified person: two accounts signing as the same human would
-- make the signature register ambiguous.
CREATE UNIQUE INDEX "User_personEntityId_key" ON "User"("personEntityId");
CREATE INDEX "User_orgUnitId_idx" ON "User"("orgUnitId");
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- A person entity that backs a login must not be deleted out from under it.
ALTER TABLE "User" ADD CONSTRAINT "User_personEntityId_fkey"
  FOREIGN KEY ("personEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deleting a unit that still has members must fail — reassign them first.
ALTER TABLE "User" ADD CONSTRAINT "User_orgUnitId_fkey"
  FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A manager who leaves empties the seat rather than deleting their reports.
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Self-management would let someone review their own stamp request and satisfy
-- the four-eyes check on paper. Longer cycles are caught in service code.
ALTER TABLE "User" ADD CONSTRAINT "User_not_own_manager"
  CHECK ("managerId" IS NULL OR "managerId" <> "id");
