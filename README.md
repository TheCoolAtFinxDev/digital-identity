# Digital Identity Certificate Service

Digital Identity and Digital Stamping platform prototype focused on entity identity certificates, KYC/KYB verification workflows, RBAC, audit logging, and PKI-backed certificate issuance.

## Stack

- NestJS API with Prisma and PostgreSQL
- Angular portal served by Nginx
- OpenSSL-based development CA
- SoftHSM with pkcs11-proxy for managed key generation
- Docker Compose deployment

## Local Run

```bash
cp .env.example .env
docker compose up -d --build
```

The portal is exposed on `http://localhost:4200`, and the API is exposed on `http://localhost:8080`.

## End-to-End Check

```bash
bash scripts/e2e-phase-1b.sh
```

## Security Notes

- Do not commit `.env`, CA private keys, issued development certificates, or evidence uploads.
- Replace all values in `.env.example` before running outside local development.
- Set `FOUR_EYES_ADMIN_OVERRIDE=false` before any production-like use.
- The generated OpenSSL CA is for development only. Use a production CA or offline-root-signed intermediate before issuing real certificates.
