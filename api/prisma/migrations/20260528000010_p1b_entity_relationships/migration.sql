-- ─── Migration 10: Phase 1-B entity relationships ────────────────────────────
-- EntityRelationship models real-world connections between legal entities.
-- subjectEntityId RELATIONSHIP_TYPE objectEntityId
-- e.g. John (subject) EMPLOYEE_OF Econet (object)
--      Econet (subject) ISSUER_FOR Econet Employees (object)

-- CreateEnum: RelationshipType
CREATE TYPE "RelationshipType" AS ENUM (
  'EMPLOYEE_OF',
  'CUSTOMER_OF',
  'VENDOR_OF',
  'DIRECTOR_OF',
  'SHAREHOLDER_OF',
  'BENEFICIAL_OWNER_OF',
  'AUTHORIZED_REPRESENTATIVE_OF',
  'AUTHORIZED_SIGNER_OF',
  'ADMIN_OF',
  'ISSUER_FOR',
  'DELEGATED_OPERATOR_OF',
  'SERVICE_PROVIDER_OF',
  'SUBSIDIARY_OF',
  'PARENT_OF',
  'AFFILIATED_WITH',
  'OTHER'
);

-- CreateEnum: RelationshipStatus
CREATE TYPE "RelationshipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION');

-- CreateTable: EntityRelationship
CREATE TABLE "EntityRelationship" (
    "id"               TEXT                NOT NULL,
    "subjectEntityId"  TEXT                NOT NULL,
    "objectEntityId"   TEXT                NOT NULL,
    "relationshipType" "RelationshipType"  NOT NULL,
    "ownershipPercent" DOUBLE PRECISION,
    "startDate"        TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate"          TIMESTAMP(3),
    "status"           "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes"            TEXT,
    "createdById"      TEXT                NOT NULL,
    "createdAt"        TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityRelationship_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntityRelationship_subjectEntityId_idx"  ON "EntityRelationship"("subjectEntityId");
CREATE INDEX "EntityRelationship_objectEntityId_idx"   ON "EntityRelationship"("objectEntityId");
CREATE INDEX "EntityRelationship_status_idx"           ON "EntityRelationship"("status");
CREATE INDEX "EntityRelationship_relationshipType_idx" ON "EntityRelationship"("relationshipType");

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_subjectEntityId_fkey"
  FOREIGN KEY ("subjectEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_objectEntityId_fkey"
  FOREIGN KEY ("objectEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
