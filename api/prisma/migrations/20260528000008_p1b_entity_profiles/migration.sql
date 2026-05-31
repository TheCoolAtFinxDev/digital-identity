-- ─── Migration 8: Phase 1-B entity profiles ──────────────────────────────────
-- PersonProfile for PERSON entities; OrganisationProfile for ORGANISATION entities.
-- Both are 1:1 with Entity (enforced by UNIQUE on entityId).

-- CreateEnum: PersonIdType
CREATE TYPE "PersonIdType" AS ENUM (
  'PASSPORT',
  'NATIONAL_ID',
  'DRIVERS_LICENCE',
  'BIRTH_CERTIFICATE',
  'RESIDENCE_PERMIT'
);

-- CreateEnum: BusinessType
CREATE TYPE "BusinessType" AS ENUM (
  'SOLE_PROPRIETOR',
  'PARTNERSHIP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'TRUST',
  'NGO',
  'COOPERATIVE',
  'GOVERNMENT_ENTITY',
  'OTHER'
);

-- CreateTable: PersonProfile
CREATE TABLE "PersonProfile" (
    "id"             TEXT          NOT NULL,
    "entityId"       TEXT          NOT NULL,
    "firstName"      TEXT          NOT NULL,
    "middleName"     TEXT,
    "lastName"       TEXT          NOT NULL,
    "dateOfBirth"    TIMESTAMP(3)  NOT NULL,
    "nationality"    TEXT          NOT NULL,
    "idType"         "PersonIdType" NOT NULL,
    "idNumber"       TEXT          NOT NULL,
    "idIssuedBy"     TEXT,
    "idIssuedDate"   TIMESTAMP(3),
    "idExpiryDate"   TIMESTAMP(3),
    "taxNumber"      TEXT,
    "addressLine1"   TEXT          NOT NULL,
    "addressLine2"   TEXT,
    "city"           TEXT          NOT NULL,
    "region"         TEXT,
    "postalCode"     TEXT,
    "addressCountry" TEXT          NOT NULL,
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonProfile_entityId_key" ON "PersonProfile"("entityId");

-- CreateTable: OrganisationProfile
CREATE TABLE "OrganisationProfile" (
    "id"                  TEXT           NOT NULL,
    "entityId"            TEXT           NOT NULL,
    "legalName"           TEXT           NOT NULL,
    "tradingName"         TEXT,
    "registrationNumber"  TEXT           NOT NULL,
    "registrationDate"    TIMESTAMP(3),
    "registrationCountry" TEXT           NOT NULL,
    "businessType"        "BusinessType" NOT NULL,
    "industrySector"      TEXT,
    "taxNumber"           TEXT,
    "vatNumber"           TEXT,
    "regAddressLine1"     TEXT           NOT NULL,
    "regAddressLine2"     TEXT,
    "regCity"             TEXT           NOT NULL,
    "regRegion"           TEXT,
    "regPostalCode"       TEXT,
    "regCountry"          TEXT           NOT NULL,
    "contactEmail"        TEXT,
    "contactPhone"        TEXT,
    "websiteUrl"          TEXT,
    "createdAt"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganisationProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganisationProfile_entityId_key" ON "OrganisationProfile"("entityId");

-- AddForeignKey
ALTER TABLE "PersonProfile" ADD CONSTRAINT "PersonProfile_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganisationProfile" ADD CONSTRAINT "OrganisationProfile_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
