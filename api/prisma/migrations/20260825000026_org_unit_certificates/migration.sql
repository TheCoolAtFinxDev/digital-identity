-- A certificate can now be held by an organisational unit, not only a legal entity.
--
-- A department stamp is signed by the DEPARTMENT's own key, so that the stamp
-- keeps verifying after the head who released it has left. That requires a
-- certificate whose holder is a unit — and a unit is deliberately not an Entity:
-- it has no legal existence, no KYB, and must never appear in a verification
-- queue. So the holder is a second, mutually exclusive column rather than a
-- reused entityId.
--
-- A unit inherits its legal standing from the ORGANISATION entity its chart
-- hangs off; that entity being APPROVED is the precondition, enforced in
-- CertificateService.

ALTER TABLE "CertificateRequest" ADD COLUMN "orgUnitId" TEXT;

ALTER TABLE "CertificateRequest"
  ADD CONSTRAINT "CertificateRequest_orgUnitId_fkey"
  FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CertificateRequest_orgUnitId_idx" ON "CertificateRequest"("orgUnitId");

-- One holder at most. A request names an entity, or a unit, or neither (the
-- profiles that are not tied to a holder) — never both. Two holders would make
-- "who does this certificate belong to" ambiguous at revocation time, which is
-- exactly when nobody wants to be guessing.
ALTER TABLE "CertificateRequest"
  ADD CONSTRAINT "CertificateRequest_single_holder"
  CHECK (NOT ("entityId" IS NOT NULL AND "orgUnitId" IS NOT NULL));
