-- ─── Migration 14: Managed (HSM-escrow) certificate issuance ─────────────────
-- Records that a certificate's private key was generated in and is custodied by
-- the HSM, plus the PKCS#11 handle (token object label + id) needed to use it.

ALTER TABLE "Certificate" ADD COLUMN "hsmManaged"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Certificate" ADD COLUMN "hsmKeyLabel" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "hsmKeyId"    TEXT;

-- New audit event emitted when the CA generates a keypair inside the HSM.
ALTER TYPE "AuditEvent" ADD VALUE 'KEY_GENERATED';
