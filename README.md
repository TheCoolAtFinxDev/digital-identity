# Digital Identity & Digital Stamping Service

Entity identity certificates, KYC/KYB verification workflows, RBAC, audit
logging, PKI-backed issuance — and the digital stamping the platform exists for:
signing a document with an HSM-held key, printing a visible seal and QR code onto
it, and letting anyone verify the file they received.

## Capabilities

| Area | What it does |
|---|---|
| Entity identity | Person/organisation registration, profiles, relationships, KYC/KYB cases with 4-eyes review |
| Certificates | CSR intake, HSM-managed issuance, renewal/rotation, revocation, expiry surveillance |
| Trust | Public CA chain, CRL, and certificate status; CRL/AIA pointers embedded in issued certificates |
| Stamping | Visible seal + QR rendered onto PDFs, HSM signature over the rendered bytes, tamper-evident public verification |
| Access | RBAC with scoped permissions, service accounts (OAuth2 client-credentials), full audit trail |

Endpoint-level detail: [docs/feature-blocks.md](docs/feature-blocks.md) and
[docs/rbac-permission-matrix.md](docs/rbac-permission-matrix.md).

## Stack

- NestJS API with Prisma and PostgreSQL
- Angular portal served by Nginx
- OpenSSL-based development CA
- SoftHSM with pkcs11-proxy for managed key generation
- pdf-lib + qrcode for the visible stamp layer
- Docker Compose deployment

## Local Run

```bash
cp .env.example .env
docker compose up -d --build
```

The portal is exposed on `http://localhost:4200`, and the API is exposed on `http://localhost:8080`.

## End-to-End Checks

```bash
bash scripts/e2e-phase-1b.sh   # entity lifecycle, KYC/KYB, 4-eyes, RBAC negatives
bash scripts/e2e-features.sh   # signing, trust, cert lifecycle, stamping, extensions
```

`e2e-phase-1b.sh` pauses ~62 s to let a throttle window clear; `e2e-features.sh`
runs straight through and needs `FOUR_EYES_ADMIN_OVERRIDE=true`.

## Security Notes

- Do not commit `.env`, CA private keys, issued development certificates, evidence uploads, or stamped documents.
- Replace all values in `.env.example` before running outside local development.
- Set `FOUR_EYES_ADMIN_OVERRIDE=false` before any production-like use.
- Set `PKI_BASE_URL` and `PUBLIC_VERIFY_BASE_URL` to externally reachable URLs before issuing or stamping anything real — both are baked into artifacts (certificate extensions, printed QR codes) and cannot be changed retroactively.
- The generated OpenSSL CA is for development only. Use a production CA or offline-root-signed intermediate before issuing real certificates.
- `PKI_OCSP_URL` should stay unset unless an OCSP responder is actually deployed; advertising a responder that does not answer is worse than advertising none.
