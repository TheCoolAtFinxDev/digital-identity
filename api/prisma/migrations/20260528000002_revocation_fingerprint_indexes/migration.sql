-- AlterTable: add fingerprint, revokedAt, revokedBy to Certificate
ALTER TABLE "Certificate"
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "revokedAt"   TIMESTAMP(3),
  ADD COLUMN "revokedBy"   TEXT;

-- CreateIndex: AuditLog performance indexes
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
CREATE INDEX "AuditLog_event_idx"     ON "AuditLog"("event");

-- CreateIndex: CertificateRequest performance indexes
CREATE INDEX "CertificateRequest_status_idx"   ON "CertificateRequest"("status");
CREATE INDEX "CertificateRequest_entityId_idx" ON "CertificateRequest"("entityId");
