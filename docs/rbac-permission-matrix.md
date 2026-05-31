# RBAC Permission Matrix

This matrix records the intended API permission boundary for Phase 1-B.

All non-public routes still require a valid JWT through `JwtAuthGuard`. Routes listed below additionally require the named RBAC permission through `PermissionGuard`, unless noted as service-scoped.

## Public Routes

| Method | Route | Notes |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/v1/auth/login` | Login throttle still applies |
| `GET` | `/verify?s=...` | Public verification |
| `GET` | `/v1/verify/:serial` | Public verification |

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
| `GET` | `/v1/certificates/:serial` | `cert:read` |
| `PATCH` | `/v1/certificates/:serial/revoke` | `cert:revoke` |
| `POST` | `/v1/cert-requests/:id/issue` | Service-scoped `cert:issue` |
| `POST` | `/v1/cert-requests/managed` | Service-scoped `cert:issue` |

`cert:issue` is resolved inside `CertificateService` because issuance may be GLOBAL or scoped to the target entity/organisation.

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

## Regression Checklist

Before merging future route changes:

- Every new non-public controller method has `@RequirePermission(...)` or an explicit service-scoped authorization note.
- Every new permission code is seeded and assigned to the intended system roles.
- Public routes use `@Public()` and are documented above.
- Scoped permissions are checked in service code using the resolved target resource ID.
- The Phase 1-B lifecycle script still passes after migrations are applied.
