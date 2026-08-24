# Feature Blocks F1–F6

What was built on top of the Phase 1-B backend, and the request/response contract
for each endpoint. Phase 1-B itself (entities, KYC/KYB, RBAC, audit) is documented
in [e2e-phase-1b.md](./e2e-phase-1b.md); route permissions live in
[rbac-permission-matrix.md](./rbac-permission-matrix.md).

| Block | Scope | Status |
|-------|-------|--------|
| F1 | Signing & signature verification with HSM-held keys | Complete |
| F2 | Trust distribution — CA chain, CRL, certificate status | Complete |
| F3 | Machine-to-machine access — service accounts, client-credentials grant | Complete |
| F4 | Certificate lifecycle — list/filter, expiry surveillance, renew + rotate | Complete |
| F5 | Document stamping — visible seal, QR, signature, public verification | Complete |
| F6 | Issued-certificate extensions — CRL DP, AIA, validated SANs | Complete |

Regression coverage: `bash scripts/e2e-features.sh`.

---

## F4 — Certificate lifecycle

### List / filter certificates

```http
GET /v1/certificates?entityId=<uuid>&expiringInDays=30&includeRevoked=false
Authorization: Bearer <token>            # cert:read
```

Returns an array (not paginated) of:

```json
{
  "serial": "1012", "subject": "...", "issuer": "...", "fingerprint": "...",
  "validFrom": "...", "validTo": "...", "isRevoked": false, "revokedAt": null,
  "hsmManaged": true, "hsmKeyLabel": "entity-2f1c...", "createdAt": "...",
  "entityId": "<uuid>", "status": "GOOD"
}
```

`status` is computed: `REVOKED` > `EXPIRED` (past `validTo`) > `GOOD`.
`expiringInDays` implies non-revoked and not-yet-expired.

### Renew / rotate

```http
POST /v1/certificates/renew
{ "entityId": "<uuid>", "revokePrevious": true }
```

Issues a fresh HSM-managed certificate **first**, then revokes the previously
active managed certificate(s) — so the entity is never without a valid key.
Requires scoped `cert:issue` and an `APPROVED` entity (enforced by the same code
path as first issuance). Returns `{ renewed: <certificate>, revokedPrevious: ["1011"] }`
and records a `CERTIFICATE_RENEWED` audit event.

Revoking a signing certificate is not retroactive on documents: anything already
stamped with it verifies as `CERTIFICATE_REVOKED` — content intact, trust
withdrawn. That is the intended semantic, and the e2e script asserts it.

### Expiry surveillance

A background sweep records a `CERTIFICATE_EXPIRING` audit event for every active
certificate entering the warning window, once per certificate per window.

| Env | Default | Meaning |
|---|---|---|
| `CERT_EXPIRY_WARNING_DAYS` | `30` | How far ahead to warn |
| `CERT_EXPIRY_SWEEP_HOURS` | `24` | Sweep interval; `0` disables |

Query them like any other event: `GET /v1/audit-logs?event=CERTIFICATE_EXPIRING`.

---

## F5 — Document stamping

### What actually gets signed

The visible seal and QR are rendered onto the PDF **first**, and the HSM then
signs the rendered bytes. The signature therefore covers exactly the file the
recipient receives, so verification is a plain hash-and-verify of the document in
their hands — no stripping the stamp back off, no ambiguity about which version
was signed.

* `originalHash` — SHA-256 of the file as uploaded (provenance).
* `stampedHash` — SHA-256 of the file that was signed and is served for download.

Non-PDF uploads, and PDFs that cannot be opened (encrypted, malformed), get a
signature-only stamp: `visibleStamp: false`, `stampedHash == originalHash`.

### Stamp a document

```http
POST /v1/stamps                          # stamp:create
Content-Type: multipart/form-data

file=@invoice.pdf
entityId=<uuid>
documentName=invoice-000123.pdf          # optional, defaults to the filename
objectId=<uuid>                          # optional link to an ObjectRecord
visible=true                             # optional, default true
stampPage=LAST                           # FIRST | LAST | ALL, default LAST
```

Response:

```json
{
  "id": "<stampId>", "verificationId": "STM-2026-A1B2C3D4E5",
  "entityId": "<uuid>", "entityName": "Econet Telecom Lesotho",
  "objectId": null, "signatureId": "<uuid>", "certSerial": "1012",
  "documentName": "invoice-000123.pdf", "mimeType": "application/pdf",
  "sizeBytes": 24576, "originalHash": "<sha256>", "stampedHash": "<sha256>",
  "visibleStamp": true, "pageCount": 1, "stampedAt": "...",
  "verifyUrl": "http://.../v1/verify/document/STM-2026-A1B2C3D4E5",
  "downloadUrl": "/v1/stamps/<stampId>/download"
}
```

Limits: 20 MB per document. The entity must already hold an active HSM-managed
certificate (managed issuance is what puts a signing key in the HSM).

### Read the stamp register

```http
GET  /v1/stamps?entityId=<uuid>&limit=50&offset=0    # stamp:read
GET  /v1/stamps/:id                                  # stamp:read
GET  /v1/stamps/:id/download                         # stamp:read — the stamped file
GET  /v1/stamps/:id/qr.png                           # stamp:read — QR PNG for reprints
```

### Public verification (no auth)

```http
GET /v1/verify/document/:verificationId
```

Content-negotiated: `Accept: text/html` renders a result page (this is what a
phone camera opens when someone scans the QR); anything else returns JSON. It
reports what the register holds and re-verifies the stored copy.

```http
POST /v1/verify/document
Content-Type: multipart/form-data

file=@received-invoice.pdf
verificationId=STM-2026-A1B2C3D4E5       # optional; omit to identify by hash
```

This is the authoritative check — the uploaded bytes are hashed and the recorded
signature is verified against *those* bytes.

| `status` | `valid` | Meaning |
|---|---|---|
| `VALID` | `true` | Unchanged since stamping; certificate currently valid |
| `TAMPERED` | `false` | Bytes no longer match the named stamp |
| `NO_MATCHING_STAMP` | `false` | No stamp on record covers these bytes |
| `SIGNATURE_INVALID` | `false` | Bytes match but the signature does not verify |
| `CERTIFICATE_REVOKED` | `false` | Content intact, signing certificate revoked |
| `CERTIFICATE_EXPIRED` | `false` | Content intact, signing certificate expired |
| `UNVERIFIABLE_COPY` | `false` | Stamp on record but no copy available to re-verify |

Both routes keep the global 10 req/60 s per-IP throttle and the 20 MB cap.

### Configuration

| Env | Default | Meaning |
|---|---|---|
| `PUBLIC_VERIFY_BASE_URL` | `http://localhost:8080` | Base URL the QR code resolves to — must be reachable by whoever scans the page |
| `STAMP_STORAGE_PATH` | `/app/storage/stamps` | Where stamped artifacts are written |

Host mount: `./storage/stamps:/app/storage/stamps:z`. Files land in
`<root>/<stampId>/<safe-filename>`.

---

## F6 — Issued-certificate extensions

Certificates issued before this block carried no revocation pointer, so a
standard client had no way to discover the CRL published at `/v1/crl.pem` — it
would simply not check revocation. Every issuance now composes its extension
section from the static profile in `pki/openssl.cnf` plus:

* `crlDistributionPoints` → `${PKI_BASE_URL}/v1/crl.pem`
* `authorityInfoAccess` → `caIssuers;URI:${PKI_BASE_URL}/v1/ca/chain`, and
  `OCSP;URI:${PKI_OCSP_URL}` only when a responder is actually deployed
* `subjectAltName` → SANs re-derived from the CSR

| Env | Default | Meaning |
|---|---|---|
| `PKI_BASE_URL` | `http://localhost:8080` | Externally reachable API base; baked into every certificate |
| `PKI_CRL_URL` / `PKI_CA_ISSUERS_URL` | derived from `PKI_BASE_URL` | Explicit overrides |
| `PKI_OCSP_URL` | unset | Publish an OCSP URL only if a responder answers it |

These are baked in at issuance: changing `PKI_BASE_URL` does not move the
pointers in certificates already issued.

### Why SANs are re-emitted, not copied

The CA keeps `copy_extensions = none`. A CSR is untrusted input, and blanket
copying is how a requester mints themselves `basicConstraints = CA:true`. Instead
`PolicyService.extractSubjectAltNames()` parses the CSR, keeps only `DNS`,
`email`, `IP` and `http(s)` `URI` entries that pass validation (max 20), and the
issuer re-emits those. Anything else — `otherName`, `dirName`, `registeredID` —
is dropped.

Without a SAN the `serverAuth` / `emailProtection` EKUs in the profile are not
usable by modern clients, which ignore the CN for name matching.

---

## Known limitations and follow-ups

These are deliberate boundaries of the work above, not oversights:

* **No OCSP responder.** `GET /v1/certificates/:serial/status` is a JSON
  endpoint, not RFC 6960. Certificates advertise an OCSP URL only when
  `PKI_OCSP_URL` is set, so nothing points at a responder that does not exist.
  Deploying one (`openssl ocsp` against the CA index) is the remaining piece
  of F2.
* **Scoped roles only affect `cert:issue`.** `PermissionGuard` resolves
  permissions at GLOBAL scope; see the RBAC matrix. Widening this is a design
  decision.
* **Signature verification by `entityId` is a heuristic.** It prefers the
  entity's HSM-managed certificate and falls back to the newest active one.
  Callers that know which key signed should pass `certSerial` — the sign and
  stamp responses both return it.
* **The Angular portal has no UI for any of F1–F6.** Portal work remains
  deliberately out of scope until the backend contract is stable (M10).
* **Not addressed here:** TLS termination, secret management beyond `.env`,
  backup/restore, the 10-year retention job, and the production CA (the OpenSSL
  development intermediate is still self-signed).
