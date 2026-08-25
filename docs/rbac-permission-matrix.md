# RBAC Permission Matrix

This matrix records the intended API permission boundary for Phase 1-B.

All non-public routes still require a valid JWT through `JwtAuthGuard`. Routes listed below additionally require the named RBAC permission through `PermissionGuard`, unless noted as service-scoped.

## Public Routes

| Method | Route | Notes |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/v1/auth/login` | Login throttle still applies |
| `POST` | `/v1/auth/token` | Service-account client-credentials grant |
| `GET` | `/verify?s=...` | Public certificate verification |
| `GET` | `/v1/verify/:serial` | Public certificate verification |
| `GET` | `/v1/verify/document/:verificationId` | Public document verification (QR target; HTML or JSON) |
| `POST` | `/v1/verify/document` | Public document verification by upload (tamper check) |
| `GET` | `/v1/ca/chain` | Trust anchor download |
| `GET` | `/v1/crl.pem` | Certificate revocation list |
| `GET` | `/v1/certificates/:serial/status` | Certificate status (GOOD / REVOKED / EXPIRED / UNKNOWN) |

The two document-verification routes are the only public routes that accept a
body. They deliberately keep the global 10 req/60 s per-IP throttle (the trust
routes skip it) and cap uploads at 20 MB.

## Authenticated Identity

| Method | Route | Permission |
|---|---|---|
| `GET` | `/v1/auth/me` | Authenticated user only |

`/v1/auth/me` intentionally has no RBAC permission gate because it only returns the caller's identity and effective GLOBAL permissions for UI gating.

## Certificates

| Method | Route | Permission |
|---|---|---|
| `GET` | `/v1/cert-requests` | `cert:read` |
| `POST` | `/v1/cert-requests` | `cert:request` |
| `GET` | `/v1/cert-requests/:id` | `cert:read` |
| `GET` | `/v1/certificates` | `cert:read` |
| `GET` | `/v1/certificates/:serial` | `cert:read` |
| `PATCH` | `/v1/certificates/:serial/revoke` | `cert:revoke` |
| `POST` | `/v1/cert-requests/:id/issue` | Service-scoped `cert:issue` |
| `POST` | `/v1/cert-requests/managed` | Service-scoped `cert:issue` |
| `POST` | `/v1/certificates/renew` | Service-scoped `cert:issue` |

`cert:issue` is resolved inside `CertificateService` because issuance may be GLOBAL or scoped to the target entity/organisation. `POST /v1/certificates/renew` carries no `@RequirePermission` for the same reason: it issues through `issueManagedCertificate`, which performs the scoped check against the target entity and re-applies the APPROVED precondition. Rotation additionally revokes the superseded certificate — that revocation is performed by the service on the issuer's behalf and is not separately gated by `cert:revoke`.

## Signing And Stamping

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/signatures` | `signature:create` |
| `POST` | `/v1/signatures/verify` | `signature:read` |
| `GET` | `/v1/signatures/entity/:entityId` | `signature:read` |
| `POST` | `/v1/stamps` | `stamp:create` |
| `GET` | `/v1/stamps` | `stamp:read` |
| `GET` | `/v1/stamps/:id` | `stamp:read` |
| `GET` | `/v1/stamps/:id/download` | `stamp:read` |
| `GET` | `/v1/stamps/:id/qr.png` | `stamp:read` |

`stamp:create` and `stamp:read` are seeded in migration `20260803000020_document_stamping` (ADMIN and CERT_MANAGER get both; ISO_OPERATOR and AUDITOR get read).

Note on `signature:*` and `object:*`: two migrations dated `20260531000015` each claimed the same two permission ids, so whichever applied second inserted nothing and its routes returned 403 for every role. Migration `20260803000019_fix_object_permissions` repairs both directions by code.

## Service Accounts

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/service-accounts` | `serviceaccount:create` |
| `GET` | `/v1/service-accounts` | `serviceaccount:read` |
| `GET` | `/v1/service-accounts/:id` | `serviceaccount:read` |
| `PATCH` | `/v1/service-accounts/:id/deactivate` | `serviceaccount:create` |
| `POST` | `/v1/service-accounts/:id/rotate-secret` | `serviceaccount:create` |
| `POST` | `/v1/service-accounts/:id/roles` | `serviceaccount:create` |
| `GET` | `/v1/service-accounts/:id/roles` | `serviceaccount:read` |
| `DELETE` | `/v1/service-accounts/:id/roles/:assignmentId` | `serviceaccount:create` |

Service principals resolve permissions through the same role model as users; `PermissionGuard` accepts either principal type.

## Entities And Profiles

| Method | Route | Permission |
|---|---|---|
| `GET` | `/v1/entities` | `entity:read` |
| `POST` | `/v1/entities` | `entity:create` |
| `GET` | `/v1/entities/:id` | `entity:read` |
| `PATCH` | `/v1/entities/:id/kyc-status` | `entity:approve` |
| `GET` | `/v1/entities/:id/person-profile` | `entity:read` |
| `POST` | `/v1/entities/:id/person-profile` | `entity:update` |
| `GET` | `/v1/entities/:id/org-profile` | `entity:read` |
| `POST` | `/v1/entities/:id/org-profile` | `entity:update` |

The legacy direct KYC-status endpoint is gated by `entity:approve` because it can influence certificate eligibility.

## Verification Cases And Evidence

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/verification-cases` | `entity:onboard` |
| `GET` | `/v1/verification-cases` | `entity:read` |
| `GET` | `/v1/verification-cases/:id` | `entity:read` |
| `PATCH` | `/v1/verification-cases/:id/submit` | `entity:onboard` |
| `PATCH` | `/v1/verification-cases/:id/assign` | `entity:review` |
| `PATCH` | `/v1/verification-cases/:id/review` | `entity:review` |
| `PATCH` | `/v1/verification-cases/:id/approve` | `entity:approve` |
| `PATCH` | `/v1/verification-cases/:id/reject` | `entity:reject` |
| `PATCH` | `/v1/verification-cases/:id/withdraw` | `entity:onboard` |
| `POST` | `/v1/verification-cases/:id/evidence` | `entity:onboard` |
| `GET` | `/v1/verification-cases/:id/evidence` | `entity:read` |
| `GET` | `/v1/verification-cases/:id/evidence/:evidenceId/download` | `entity:read` |
| `DELETE` | `/v1/verification-cases/:id/evidence/:evidenceId` | `entity:onboard` |

Workflow rules such as creator-only submission and 4-eyes separation are enforced in `VerificationCasesService`.

## Relationships

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/entity-relationships` | `relationship:create` |
| `GET` | `/v1/entity-relationships` | `relationship:read` |
| `GET` | `/v1/entity-relationships/:id` | `relationship:read` |
| `PATCH` | `/v1/entity-relationships/:id` | `relationship:update` |
| `PATCH` | `/v1/entity-relationships/:id/deactivate` | `relationship:deactivate` |
| `GET` | `/v1/entities/:id/relationships` | `relationship:read` |

## Objects

| Method | Route | Permission |
|---|---|---|
| `GET` | `/v1/objects` | `object:read` |
| `POST` | `/v1/objects` | `object:create` |
| `GET` | `/v1/objects/:id` | `object:read` |

`object:create` and `object:read` are seeded in migration `20260531000015_object_permissions`.

## Users, Roles, Audit

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/users` | `user:create` |
| `GET` | `/v1/users` | `user:read` |
| `GET` | `/v1/users/:id` | `user:read` |
| `PATCH` | `/v1/users/:id` | `user:update` |
| `PATCH` | `/v1/users/:id/deactivate` | `user:deactivate` |
| `PATCH` | `/v1/users/:id/password` | `user:update` |
| `POST` | `/v1/users/:id/roles` | `user:assign-role` |
| `GET` | `/v1/users/:id/roles` | `user:read` |
| `DELETE` | `/v1/users/:id/roles/:assignmentId` | `user:assign-role` |
| `GET` | `/v1/roles` | `user:read` |
| `GET` | `/v1/roles/:id` | `user:read` |
| `GET` | `/v1/permissions` | `user:read` |
| `GET` | `/v1/audit-logs` | `audit:read` |

## Scope Resolution

`PermissionGuard` resolves `@RequirePermission(...)` in two stages.

**Stage 1 — organisation-wide.** The permission is looked up with no scope
filter, exactly as it was before WP-2.4. Every identity operator holds a `GLOBAL`
assignment, so this answers almost every request in one query and nothing that
worked before can start failing.

**Stage 2 — narrow grants.** Only if stage 1 refuses, the guard resolves what the
route declared it acts on and asks again with the assignments that would cover
it. A scoped grant is therefore strictly *additional* authority; it can never
take authority away.

### Routes declare their target; the guard never guesses

Every guarded route carries either `@ScopedTo({...})` naming the resource it acts
on, or `@GlobalScope()` stating that the permission is not narrowable. Inferring
the target from the URL shape would mis-scope any route whose `:id` is not what
it looks like, which grants authority over the wrong resource — a security bug,
not a glitch. `ScopeCoverageService` walks every controller at boot and **refuses
to start** if a guarded route declares neither, so the declaration cannot be
forgotten.

```ts
@RequirePermission('orgunit:update')
@ScopedTo({ target: 'ORG_UNIT', from: 'param', name: 'id' })
@Patch('org-units/:id/head')
```

Targets: `ORG_UNIT`, `ENTITY`, `USER`, `VERIFICATION_CASE`, `CERT_REQUEST`,
`CERTIFICATE` (by serial), `RELATIONSHIP`, `STAMP`. Everything other than
`ORG_UNIT` and `ENTITY` is walked back to its owning entity.

### What a scoped grant covers

- **Down the chart, never up or sideways.** A grant on the Technology division
  authorises acting on the Finance department beneath it. A grant on Finance
  authorises nothing on Technology and nothing on a sibling department.
- **The organisation entity covers the whole chart.** An `ORGANISATION`- or
  `ENTITY`-scoped grant on the entity a chart hangs off covers every unit in it.
- **A target that cannot be found refuses the request.** A missing or mistyped id
  yields no candidates rather than a permissive fallback; whoever holds the
  permission organisation-wide still reaches the handler's own 404.

### Routes that name two targets

Moving something needs authority over both ends, so those routes declare both and
the caller must satisfy every declaration the request actually populates:

```ts
@ScopedTo([
  { target: 'ORG_UNIT', from: 'param', name: 'id' },        // where it is
  { target: 'ORG_UNIT', from: 'body',  name: 'parentId' },  // where it goes
])
```

A rename carries no `parentId`, so only the first declaration applies to it.
Holding the source alone is not permission to graft a unit onto someone else's
division.

### Deliberately not narrowable

Some permissions stay organisation-wide because narrowing them would let a scoped
holder widen their own authority: creating users, assigning and revoking roles,
and minting service accounts. Granting a role is how authority is created, so
delegating it needs a rule about which roles may be granted at which scope — that
rule does not exist yet.

### Read isolation is still out of scope

List endpoints remain organisation-wide. A department-limited person can still
*see* other departments' records; they simply cannot act on them. Turning scope
into a filter across every list is a separate piece of work, and this change does
not attempt it.

`cert:issue` continues to resolve its own scope inside
`CertificateService.resolveIssuePermission()` and is unchanged.

Regression: `scripts/e2e-scoped-authority.sh` (23 assertions), plus 35 unit tests
across `test/scope-resolution.spec.ts` and `test/permission-guard-scope.spec.ts`.

## Organisational Structure

| Method | Route | Permission |
|---|---|---|
| `POST` | `/v1/org-units` | `orgunit:create` |
| `GET` | `/v1/org-units` | `orgunit:read` |
| `GET` | `/v1/org-units/:id` | `orgunit:read` |
| `PATCH` | `/v1/org-units/:id` | `orgunit:update` |
| `PATCH` | `/v1/org-units/:id/head` | `orgunit:update` |
| `PATCH` | `/v1/org-units/:id/deactivate` | `orgunit:update` |
| `PATCH` | `/v1/users/:id/placement` | `user:update` |
| `GET` | `/v1/users/:id/approval-chain` | `orgunit:read` |

Seeded in migration `20260824000022_org_units`: ADMIN administers the structure,
every other seeded role gets `orgunit:read` — approval routing depends on people
being able to find their own unit and its head.

Placing a person is gated on `user:update` rather than `orgunit:update` because
it edits the user record (their unit, their line manager, and the verified PERSON
entity behind their login).

Structural rules — one active root per organisation, ORGANISATION > DIVISION >
DEPARTMENT, no cycles, no self-management — are enforced in `OrgUnitsService`
and, where a single row can express them, by database constraints.

**Permission id allocation:** new codes start at `...0002-000000000040`. Ids 32-39
are reserved because migration `20260803000019` conditionally claims 32 and 33
for `signature:*` on databases where the original seed lost an id race. Two
migrations claiming the same permission id is what silently disabled `/v1/objects`
for every role, ADMIN included — allocate from the top, never reuse.

## Regression Checklist

Before merging future route changes:

- Every new non-public controller method has `@RequirePermission(...)` or an explicit service-scoped authorization note.
- Every new guarded method also has `@ScopedTo({...})` or `@GlobalScope()`. The app refuses to boot without one, so this is enforced rather than remembered.
- Every new permission code is seeded and assigned to the intended system roles.
- Public routes use `@Public()` and are documented above.
- Scoped permissions are checked in service code using the resolved target resource ID.
- `bash scripts/ci.sh` passes: typecheck, unit tests, and the Phase 1-B, org-structure, scoped-authority and feature suites.
