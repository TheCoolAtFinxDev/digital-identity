# Phase 1-B End-to-End Lifecycle Test

This document describes the Phase 1-B backend end-to-end test: what it covers,
how to run it, and the manual command sequence behind each step (for debugging
or portal-integration reference in M9/M10).

Everything built after Phase 1-B — signing, trust distribution, service accounts,
certificate lifecycle, document stamping, certificate extensions — is covered by
`scripts/e2e-features.sh` and documented in [feature-blocks.md](./feature-blocks.md).

## Running the automated test

```bash
cd digital-identity
bash scripts/e2e-phase-1b.sh                 # against http://localhost:8080
bash scripts/e2e-phase-1b.sh http://host:8080  # against a custom base URL
```

The script is **idempotent across runs**: every user/entity is tagged with a
unique numeric suffix derived from the current timestamp, so repeated runs do
not collide. It exits `0` if all assertions pass, `1` otherwise.

Requirements on the host: `bash`, `curl`, `openssl`, `python3`.

## What it validates

| Block | Coverage |
|-------|----------|
| **Scenario A** | Organisation KYB lifecycle: user/role setup → entity → org-profile → KYB case → evidence (SHA-256) → submit → review → approve → entity APPROVED → cert request → issue → public verify → audit |
| **Scenario B** | Person KYC lifecycle: PERSON entity → person-profile → KYC case → evidence → review → approve → EMPLOYEE_OF + AUTHORIZED_SIGNER_OF relationships → cert request → issue → verify → audit |
| **Negative N1** | Unapproved entity issuance → `422`, request stays `NEW` |
| **Negative N2** | User without `cert:issue` → `403` |
| **Negative N3** | `ENTITY`-scoped `cert:issue` for Entity A cannot issue for Entity B |
| — | *N3 setup note: the requests are raised by the GLOBAL cert manager. `PermissionGuard` only honours GLOBAL assignments, so a scoped role holder cannot pass the `cert:request` gate — see [rbac-permission-matrix.md](./rbac-permission-matrix.md#scope-resolution--important-limitation).* |
| **Negative N4** | Evidence upload after `SUBMITTED` → `400` |
| **Negative N5** | Evidence delete after `SUBMITTED` → `400` |
| **Negative N6** | Self-relationship (subject == object) → `400` |
| **Negative N7** | User without `entity:approve` cannot approve → `403` |
| **Negative N8** | Audit log event filter returns only event-specific records |
| **Audit sweep** | `userId` populated on `CASE_CREATED`, `CASE_APPROVED`, `EVIDENCE_UPLOADED`, `ENTITY_TYPE_SET`, `CERTIFICATE_ISSUED`, `RELATIONSHIP_CREATED`, `PERMISSION_CHECK_FAILED`, `USER_CREATED`, `ROLE_ASSIGNED` |

## Rate-limit note

The API enforces a per-route-handler throttle of **10 requests / 60 s / IP**
(`@nestjs/throttler`). The lifecycle never approaches this for any single
handler, but firing one audit query per event in a tight loop does. The script
therefore waits ~62 s for the audit-query handler's window to clear, then runs
the audit verification in a handful of consolidated queries. This is a test
pacing concern only — no production limit was changed.

## Manual command sequence (reference)

All authenticated calls use a Bearer token obtained from login. Replace the
placeholder IDs with values returned by earlier steps.

### 0. Authenticate

```bash
curl -s -X POST http://localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change_me_admin_password"}'
# -> { "accessToken": "...", "expiresIn": 86400 }   (JWT payload: { sub, userId, username })
```

### 1. Users and role assignment (admin)

```bash
# Create a user
curl -s -X POST http://localhost:8080/v1/users \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"username":"iso_op_1","email":"op@econet.ls","password":"...","displayName":"Operator"}'

# Assign a seeded role (GLOBAL scope). Seeded role IDs:
#   ISO_OPERATOR  00000000-0000-0000-0001-000000000002
#   ISO_REVIEWER  00000000-0000-0000-0001-000000000003
#   ISO_APPROVER  00000000-0000-0000-0001-000000000004
#   CERT_MANAGER  00000000-0000-0000-0001-000000000005
curl -s -X POST http://localhost:8080/v1/users/$USER_ID/roles \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"roleId":"00000000-0000-0000-0001-000000000002","scope":"GLOBAL"}'
```

### 2. Entity + profile (iso_operator)

```bash
# ORGANISATION (or "PERSON")
curl -s -X POST http://localhost:8080/v1/entities \
  -H "Authorization: Bearer $OP" -H 'Content-Type: application/json' \
  -d '{"name":"Econet Telecom Lesotho","country":"LS","entityType":"ORGANISATION"}'

# Organisation profile (advances entity DRAFT -> PENDING_VERIFICATION)
curl -s -X POST http://localhost:8080/v1/entities/$ENTITY_ID/org-profile \
  -H "Authorization: Bearer $OP" -H 'Content-Type: application/json' \
  -d '{"legalName":"Econet (Pty) Ltd","registrationNumber":"LS/2001/1",
       "registrationCountry":"LS","businessType":"PRIVATE_LIMITED",
       "regAddressLine1":"7 Griffith Rd","regCity":"Maseru","regCountry":"LS"}'
```

### 3. Verification case + evidence (iso_operator)

```bash
# KYB for ORGANISATION, KYC for PERSON
curl -s -X POST http://localhost:8080/v1/verification-cases \
  -H "Authorization: Bearer $OP" -H 'Content-Type: application/json' \
  -d '{"entityId":"'$ENTITY_ID'","caseType":"KYB"}'

# Upload evidence (multipart; DRAFT cases only; 20 MB/file, 100 MB/case)
curl -s -X POST http://localhost:8080/v1/verification-cases/$CASE_ID/evidence \
  -H "Authorization: Bearer $OP" \
  -F "file=@company_cert.pdf;type=application/pdf" \
  -F "documentType=COMPANY_CERTIFICATE"

# Submit (creator only; requires >=1 evidence)
curl -s -X PATCH http://localhost:8080/v1/verification-cases/$CASE_ID/submit \
  -H "Authorization: Bearer $OP"
```

### 4. 4-eyes review and approval

```bash
# Reviewer (entity:review) assigns self then reviews. reviewer != creator.
curl -s -X PATCH http://localhost:8080/v1/verification-cases/$CASE_ID/assign \
  -H "Authorization: Bearer $REVIEWER" -H 'Content-Type: application/json' -d '{}'
curl -s -X PATCH http://localhost:8080/v1/verification-cases/$CASE_ID/review \
  -H "Authorization: Bearer $REVIEWER" -H 'Content-Type: application/json' \
  -d '{"reviewNotes":"Documents verified."}'

# Approver (entity:approve) approves. approver != creator and != reviewer.
# -> sets Entity.status = APPROVED and Entity.kycStatus = APPROVED
curl -s -X PATCH http://localhost:8080/v1/verification-cases/$CASE_ID/approve \
  -H "Authorization: Bearer $APPROVER"
```

### 5. Certificate issuance (cert_manager)

```bash
# Submit CSR (entity must already exist; issuance is gated, not creation)
curl -s -X POST http://localhost:8080/v1/cert-requests \
  -H "Authorization: Bearer $CM" -H 'Content-Type: application/json' \
  -d '{"csrPem":"-----BEGIN CERTIFICATE REQUEST-----\n...","entityId":"'$ENTITY_ID'"}'

# Issue. Requires cert:issue (GLOBAL, or ENTITY/ORGANISATION scoped to this entity)
# AND entity.status == APPROVED && entity.kycStatus == APPROVED, else 422 (request stays NEW).
curl -s -X POST http://localhost:8080/v1/cert-requests/$REQ_ID/issue \
  -H "Authorization: Bearer $CM"
```

### 6. Public verification (no auth)

```bash
curl -s http://localhost:8080/v1/verify/$SERIAL
# -> { valid, serial, subject, issuer, isExpired, isRevoked, entity{...}, checkedAt }
```

### 7. Relationships (iso_operator)

```bash
curl -s -X POST http://localhost:8080/v1/entity-relationships \
  -H "Authorization: Bearer $OP" -H 'Content-Type: application/json' \
  -d '{"subjectEntityId":"'$PERSON_ID'","objectEntityId":"'$ORG_ID'",
       "relationshipType":"EMPLOYEE_OF"}'
```

### 8. Audit query (auditor / admin)

```bash
# Filterable by event, entityId, requestId, from/to date, page, limit
curl -s "http://localhost:8080/v1/audit-logs?event=CERTIFICATE_ISSUED&limit=20" \
  -H "Authorization: Bearer $ADMIN"
```
