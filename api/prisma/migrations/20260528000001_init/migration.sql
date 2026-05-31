-- CreateEnum
CREATE TYPE "AuditEvent" AS ENUM ('REQUEST_CREATED', 'CERTIFICATE_ISSUED', 'REQUEST_REJECTED', 'CERTIFICATE_VIEWED', 'CERTIFICATE_REVOKED', 'VERIFICATION_PERFORMED', 'ENTITY_CREATED', 'KYC_STATUS_UPDATED', 'OBJECT_CREATED', 'OBJECT_VIEWED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'ISSUED', 'REJECTED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "event" "AuditEvent" NOT NULL,
    "requestId" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "certPem" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "issuer" TEXT,
    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRequest" (
    "id" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "csrPem" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'usr_entity_cert',
    "subject" TEXT,
    "keyBits" INTEGER,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CertificateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectRecord" (
    "id" TEXT NOT NULL,
    "objectType" "ObjectType" NOT NULL,
    "reference" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "ObjectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_requestId_key" ON "Certificate"("requestId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_serial_key" ON "Certificate"("serial" ASC);

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CertificateRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectRecord" ADD CONSTRAINT "ObjectRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
