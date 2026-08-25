# Digital Identity and Digital Stamping Platform — Demonstration Script

## Purpose

This runbook is designed for a 25–35 minute demonstration to an executive,
manager, security lead, or governance stakeholder. It explains the business
problem first, demonstrates the working controls, and closes with the current
delivery status and next steps.

The demonstration has two clearly labelled parts:

1. **Live platform functions** backed by the API and database: authentication,
   identity records, KYC/KYB cases, four-eyes control, certificates, RBAC,
   audit, signing, stamping, and public verification.
2. **Staff experience prototype** under `/staff`: the screens and workflow are
   functional in the browser, but currently use in-memory fixture data while
   the S4/S5 workflow endpoints are being implemented.

Do not describe the staff prototype as production-connected. Calling this out
confidently demonstrates delivery discipline rather than weakening the demo.

---

## 1. Demo objective and core message

The single sentence to repeat throughout the presentation is:

> The platform connects a verified legal or personal identity to controlled
> digital credentials, governed approvals, tamper-evident documents, and a
> complete audit trail.

By the end of the demo, the audience should understand that the system:

- knows **who** an individual or organisation is;
- records **how** that identity was verified;
- controls **who may review, approve, issue, sign, or stamp**;
- protects signing keys in an HSM-backed service rather than exposing private
  keys to users;
- makes a stamped document independently verifiable;
- records security-relevant activity for audit and investigation;
- supports human users and machine-to-machine clients.

---

## 2. Presenter preparation — complete before the meeting

### Environment

From the repository root:

```bash
cd digital-identity
cp .env.example .env       # only if .env does not already exist
docker compose up -d --build
```

Wait until the services are healthy, then confirm:

```bash
curl -fsS http://localhost:8080/health
```

Expected portal and API addresses:

- Portal: `http://localhost:4200`
- API: `http://localhost:8080`
- API health: `http://localhost:8080/health`

### Demonstration login

- Username: `admin`
- Password: `change_me_admin_password`

These are local development credentials. Never use or display them as proposed
production credentials. Explain that real deployment secrets will be replaced
and managed outside source control.

### Seed representative data

The dashboard is more persuasive when it contains real workflow records. On a
fresh local environment, run:

```bash
bash scripts/e2e-phase-1b.sh
bash scripts/e2e-features.sh
```

The first script deliberately pauses for approximately 62 seconds to clear the
API throttle window. Run these before the meeting, not during it. They create
timestamped demonstration entities, cases, users, certificates, relationships,
audit events, signatures, and stamps.

### Rehearsal checklist

- Open the portal and confirm the admin login works.
- Confirm the dashboard cards show non-zero records.
- Identify one `APPROVED` entity to open during the demo.
- Identify one completed verification case with evidence.
- Identify one issued certificate and write down its serial number.
- Confirm that entering the serial on **Verify** returns `VALID`.
- Confirm **My documents** and **Awaiting me** display their fixture records.
- Keep a stamped PDF and its verification ID available if demonstrating the
  upload verification API.
- Disable browser notifications and close unrelated tabs.
- Use browser zoom around 90–100% so the navigation remains on one line.
- Keep this runbook open on a second screen or printed.

### Optional confidence check

Before leaving for the meeting, run:

```bash
cd api && npm test -- --runInBand && npm run build
cd ../portal && npm run build
```

If the host prevents child-process execution, the SAN-policy unit test may show
`spawnSync openssl EPERM`. That is a restricted-host condition. Run the full
containerised CI suite on a Docker-capable host for authoritative verification.

---

## 3. Room opening — 2 minutes

### Screen

Show the login page but do not sign in immediately.

### Say

> Today I am demonstrating a digital trust platform, not simply a document
> upload application. Its job is to establish identity, govern who can approve
> that identity, issue protected digital credentials, and use those credentials
> to sign and stamp documents that anyone can verify.

> The system is designed around separation of duties. Registration, review,
> approval, certificate issuance, and audit are distinct capabilities. Access is
> controlled through roles and permissions, and important actions are recorded.

> I will first show the live identity and trust platform. I will then show the
> staff-facing workflow being prepared for the next backend integration.

### Emphasise

- The platform supports both people and organisations.
- A certificate is not issued merely because someone uploads a request.
- A document stamp is cryptographic evidence, not just an image pasted onto a PDF.

---

## 4. Authentication and permission-aware navigation — 2 minutes

### Action

1. Enter `admin`.
2. Enter `change_me_admin_password`.
3. Select **Sign In**.
4. Pause on the dashboard and point to the username and navigation bar.

### Say

> Authentication establishes the user session. The navigation is then filtered
> using the user's effective permissions. An operator, reviewer, certificate
> manager, and auditor do not need to see or perform the same actions.

> I am using the administrator account for a compact demonstration. In normal
> operation, separate named users should perform each stage of the four-eyes
> workflow. The backend enforces those permissions; hiding a menu alone is not
> treated as security.

### Expected result

- The dashboard loads.
- The top-right username is `admin`.
- Navigation includes staff documents, entities, cases, relationships,
  certificates, users, roles, audit, and verification.

### If login fails

- Confirm the API is healthy at `http://localhost:8080/health`.
- Confirm `.env` contains the expected `AUTH_USERNAME` and `AUTH_PASSWORD`.
- Remember that bootstrap creates the admin only when it does not already exist;
  changing `.env` does not automatically replace an existing user's password.

---

## 5. Dashboard and governed lifecycle — 2 minutes

### Action

Point out the dashboard counts, then slowly follow the five-step lifecycle shown
on the page.

### Say

> This dashboard summarises the trust register: legal identities, approved
> identities, open verification cases, relationships, certificates, and audit
> activity.

> The governed lifecycle is visible here. We register an identity, complete its
> legal profile, perform KYC or KYB with supporting evidence, request a
> certificate, and issue it only after approval. Verification is then available
> to a relying party without requiring an internal account.

> That sequence matters. It prevents credential issuance from becoming an
> isolated technical process with no link to due diligence.

---

## 6. Legal identity register — 3 minutes

### Action

1. Select **Entities**.
2. Show status/type filtering and the existing records.
3. Open a prepared approved organisation.
4. Show its core record, organisation profile, verification cases, and
   relationships.
5. Optionally select **Register Entity** and show, but do not submit, the form.

### Say

> The entity register is the foundation. It distinguishes a person from an
> organisation and tracks the identity state independently from any certificate.

> For an organisation, we capture legal name, registration number, jurisdiction,
> business type, and registered address. A person uses a separate profile suited
> to individual KYC. This avoids forcing unlike identity types into one vague
> record.

> Notice that approval state is explicit. Downstream certificate issuance checks
> both the entity and KYC/KYB status. An unapproved entity cannot receive a
> managed certificate even if a caller has technical permission to issue one.

### Business point

> The platform answers not only “is this certificate technically valid?” but
> also “which verified legal identity stands behind it?”

---

## 7. KYC/KYB evidence and four-eyes approval — 4 minutes

### Action

1. Select **Cases**.
2. Open a prepared completed case.
3. Show the case type, entity, creator, reviewer, approver, state, notes, and
   evidence list.
4. If suitable data exists, open or download an evidence file.
5. Describe the state progression:
   `DRAFT → SUBMITTED → UNDER_REVIEW → PENDING_APPROVAL → APPROVED`.

### Say

> A verification decision is represented as a case, not as a loose status edit.
> The case carries its evidence and decision history.

> Evidence is uploaded while the case is in draft. The platform records a
> SHA-256 digest and protects the workflow from evidence being silently changed
> after submission.

> The four-eyes rule separates the creator, reviewer, and approver. The reviewer
> checks the evidence and records notes. The approver makes the final decision.
> The backend rejects invalid transitions and unauthorised actors.

> In this local demonstration, an explicit development setting allows an
> administrator to walk the flow alone. That override must be disabled for any
> production-like deployment so separation of duties is strictly enforced.

### Important security statement

> The control is implemented server-side. Direct API calls cannot bypass it by
> skipping screens or changing browser state.

---

## 8. Relationships and attributable people — 2 minutes

### Action

1. Select **Relationships**.
2. Show examples such as `EMPLOYEE_OF`, `AUTHORIZED_SIGNER_OF`, or another
   prepared relationship.
3. Explain subject and object entities.

### Say

> Identity records become useful when the platform can represent authority and
> affiliation. A verified person may be linked to an organisation as an employee
> or authorised signer.

> These relationships are explicit, dated, auditable, and can be deactivated
> rather than erased. The service also rejects nonsensical self-relationships.

> This provides the basis for attributing a person's signature to the individual
> and understanding the organisational context in which they acted.

---

## 9. Roles, permissions, and separation of duties — 3 minutes

### Action

1. Select **Roles**.
2. Show the seeded roles and their permission sets.
3. Select **Users**, open a prepared user, and show role assignments.
4. Point out global versus scoped assignment where present.

### Say

> Access is permission-based rather than hard-coded to screens. Seeded roles
> include administrator, identity operator, reviewer, approver, certificate
> manager, and auditor.

> Role assignment is itself controlled and audited. Certificate issuance also
> supports entity or organisation scope, so a certificate manager can be limited
> to an intended trust domain.

> The API uses the same permission model for human users and service accounts.
> Machine integrations obtain tokens through a client-credentials flow, and
> their secrets are shown only once when created or rotated.

### Honest boundary if asked

> Most guarded routes currently resolve global permissions. Certificate issuance
> performs target-aware scoped authorization in the service. Extending target
> scope consistently across every route is a documented design decision and
> remains future hardening work.

---

## 10. Certificate issuance and lifecycle — 4 minutes

### Action

1. Select **Certificates**.
2. Open a prepared issued request.
3. Show the entity link, request state, subject information, certificate serial,
   validity, and revocation controls.
4. If available, show the certificate details or download.
5. Avoid revoking the only prepared demo certificate unless you have another
   valid one ready.

### Say

> A certificate request is linked to an entity. Issuance requires the relevant
> permission and an approved identity. For managed issuance, key generation and
> signing are performed through the HSM integration, so the private key is not
> handed to a portal user.

> Issued certificates contain trust-discovery information: the CA chain location,
> certificate revocation list location, and validated subject alternative names.
> The CA does not blindly copy arbitrary CSR extensions, because that would allow
> an untrusted requester to smuggle unsafe certificate attributes into issuance.

> Lifecycle operations include listing, expiry surveillance, renewal with key
> rotation, and revocation. Renewal issues the replacement before revoking the
> previous active managed certificate so the entity does not experience an
> avoidable credential gap.

### Key distinction

> Revocation withdraws trust in a certificate. It does not rewrite history. A
> document signed earlier remains byte-for-byte intact, but verification reports
> that its signing certificate is now revoked.

---

## 11. Public certificate verification — 2 minutes

### Action

1. Copy the serial number from the prepared issued certificate.
2. Select **Verify**.
3. Enter the serial number and select **Verify**.
4. Show the `VALID` result, entity, subject, issuer, and validity dates.
5. If time allows, enter a nonexistent serial to demonstrate a clean failure.

### Say

> Verification is deliberately public because recipients and relying parties
> should not need an internal account to establish trust.

> The result combines technical certificate status with the identity record
> behind it. It reports expiry and revocation rather than merely confirming that
> a serial exists.

> The page can also scan QR codes. For certificates, the QR resolves to the
> serial-based verification route. Stamped documents use a document verification
> identifier and a stronger uploaded-file integrity check.

---

## 12. Digital document stamping — 4 minutes

### Screen or artifact

Use a prepared stamped PDF and, where convenient, the API response or public QR
verification page.

### Say

> The platform's central document feature is digital stamping. It does not simply
> place a visual seal over a PDF.

> First, the visible seal and QR code are rendered onto the PDF. Then the exact
> rendered bytes are hashed and signed using the managed signing key. Therefore,
> the signature covers the document the recipient actually receives—including
> its visible stamp.

> The platform records two hashes: the original upload hash for provenance and
> the stamped-file hash for authoritative verification. It also records the
> certificate serial, entity, timestamp, verification ID, and optional linked
> object record.

> A recipient can scan the QR code to view the register entry. For authoritative
> tamper detection, the recipient uploads the file they received. The service
> hashes those exact bytes and verifies the recorded signature against them.

### Explain possible results

- `VALID`: content unchanged and certificate currently trusted.
- `TAMPERED`: bytes do not match the named stamp.
- `NO_MATCHING_STAMP`: no registered stamp covers the uploaded bytes.
- `SIGNATURE_INVALID`: bytes match the record but signature verification fails.
- `CERTIFICATE_REVOKED`: content intact, but trust in the signer was withdrawn.
- `CERTIFICATE_EXPIRED`: content intact, but the certificate has expired.
- `UNVERIFIABLE_COPY`: a record exists but the retained copy cannot be checked.

### Executive summary line

> The visible seal communicates trust to a person; the cryptographic signature
> and public verification service prove it to a system.

---

## 13. Staff daily-operations experience — 5 minutes

### Transition statement

> Everything shown so far is backed by the current API and database. I will now
> show the staff-facing experience under active integration. Its UI contract and
> state transitions are implemented, but this environment currently supplies its
> data from in-memory fixtures until the S4/S5 endpoints are completed.

### 13.1 My documents

#### Action

1. Select **My documents**.
2. Show the merged **Awaiting me** feed.
3. Show tabs/sections for personal documents, documents sent for signature, and
   stamp requests.
4. Open a stamped document.

#### Say

> Staff should not have to understand backend resource names. Their work arrives
> in one inbox: documents to sign and stamp requests to review or approve.

> The history distinguishes signed, stamped, awaiting action, rejected,
> superseded, declined, and recalled documents. The detail page shows who acted,
> the cryptographic identifiers, and the document's current trust state.

### 13.2 Request a departmental stamp

#### Action

1. Open a draft or awaiting-review stamp request.
2. Show the chosen department-level seal.
3. Point out that division and organisation seal levels are visible but disabled
   for the pilot.
4. Show the approval-chain stepper.
5. Submit a draft request if available.

#### Say

> The requester sees who will review and approve before submission. The line
> manager reviews, and the department head approves. Missing placement, inactive
> managers, vacant head positions, self-approval, and routing conflicts are
> intended to surface as blockers rather than failing mysteriously later.

> Higher-level seals remain visible but disabled. This communicates the planned
> capability without pretending it is included in the department-level pilot.

### 13.3 Awaiting me

#### Action

1. Select **Awaiting me**.
2. Open a review item.
3. Show the explanatory copy and note field.
4. Approve or reject one fixture request.
5. Navigate back and show the updated fixture state.

#### Say

> The decision screen explains the effect before the user acts. Review and final
> approval are distinct stages, and rejection returns the item to the requester
> with a reason.

> The fixture implementation keeps state in memory, which lets us rehearse the
> end-to-end interaction now. The HTTP implementation already targets the planned
> endpoint contract; integration will replace one dependency binding rather than
> rewrite the screens.

### 13.4 Recall

#### Action

1. Open a stamped document detail.
2. Select the recall action.
3. Read the confirmation wording aloud but cancel unless a fixture reset is easy.

#### Say

> Recall withdraws one document. It does not revoke the department's signing key
> or invalidate unrelated documents. That distinction is stated explicitly to
> prevent an operator from confusing a document action with a certificate-wide
> security event.

---

## 14. Audit trail — 3 minutes

### Action

1. Select **Audit**.
2. Filter for a meaningful event such as `CERTIFICATE_ISSUED`, `CASE_APPROVED`,
   `STAMP_CREATED`, or `PERMISSION_CHECK_FAILED`.
3. Open or point to actor, timestamp, entity/request context, and event details.

### Say

> Governance requires evidence of actions as well as successful outcomes. The
> audit register records authentication, user and role administration, case
> transitions, evidence handling, permission failures, certificate lifecycle,
> signing, stamping, and service-account events.

> Failed authorization attempts are valuable audit data, not just HTTP errors.
> Filters let an auditor focus on an event, actor, entity, request, or time range.

> Audit records are append-oriented operational evidence. Production deployment
> must add the required retention, archival, backup, and monitoring controls for
> the organisation's policy and regulatory obligations.

---

## 15. Architecture explanation — 2 minutes

Use this only if the audience wants a technical summary.

### Say

> The portal is an Angular application served through Nginx. The API uses NestJS
> and Prisma with PostgreSQL. A development CA issues certificates, while SoftHSM
> and PKCS#11 provide the managed-key boundary. PDF rendering and QR generation
> happen before cryptographic signing. Docker Compose assembles the local stack.

> Trust endpoints publish the CA chain, CRL, and certificate status. Public
> document verification is separated from authenticated staff operations.

> The development CA and current secret defaults are intentionally local-only.
> Production requires approved PKI architecture, TLS termination, external secret
> management, backup and recovery, monitoring, retention controls, and hardened
> HSM connectivity.

---

## 16. Close — 2 minutes

### Say

> The completed foundation already connects identity onboarding, evidence-based
> approval, role-controlled certificate issuance, HSM-backed signing, document
> stamping, public verification, and audit.

> The current integration focus is completing the staff workflow endpoints for
> document inboxes, stamp requests, approval decisions, and recall, then replacing
> fixture data with the live API. After that, the priority moves to production
> controls: deployment architecture, managed secrets, TLS, production CA and HSM
> arrangements, monitoring, backup, retention, and operational acceptance tests.

> The decision I am seeking is approval to complete that integration and prepare
> a controlled pilot with named users, defined departments, explicit approvers,
> and agreed acceptance criteria.

### Suggested final question

> Would you prefer the pilot to begin with one department and one document class,
> or with multiple departments using the same approval policy?

---

## 17. Questions likely to be asked

### “Can somebody issue a certificate for an unverified organisation?”

No. Issuance checks the caller's permission and the target entity's approved
identity/KYC state. The API rejects issuance for an unapproved entity.

### “Is the stamp just a QR code or image?”

No. The QR and visible seal are rendered first, then the rendered document bytes
are signed. Upload verification checks the received bytes against the recorded
hash and cryptographic signature.

### “Where is the private key?”

Managed keys are generated and used through the HSM/PKCS#11 integration. The
portal user does not download the managed private key.

### “What happens when a certificate is revoked?”

The certificate status and CRL report revocation. Previously stamped documents
remain intact, but verification reports `CERTIFICATE_REVOKED`, meaning their
content is unchanged while current trust in the signer has been withdrawn.

### “Can a user approve their own onboarding case?”

Production mode enforces distinct actors across creation, review, and approval.
The local demo can enable an explicit administrator override solely to make
single-presenter demonstrations practical.

### “Can anyone verify a document?”

Yes. Public verification requires no internal account. The strongest check is to
upload the received file with its verification ID so the service validates those
exact bytes.

### “Does the system support service integrations?”

Yes. Service accounts use OAuth2-style client credentials, receive RBAC roles,
and obtain JWTs through `/v1/auth/token`. Client secrets are returned only once
on creation or rotation and stored as hashes.

### “Is this production-ready?”

The application foundation and core workflows are implemented, but production
readiness is broader than feature completion. Remaining deployment work includes
the live staff endpoint integration, production CA/HSM architecture, TLS, secret
management, monitoring, backup and recovery, retention, penetration testing,
operational procedures, and user acceptance testing.

### “Does it provide OCSP?”

It publishes a CRL and a JSON certificate-status endpoint. A standards-compliant
RFC 6960 OCSP responder is not yet deployed, and certificates do not advertise
an OCSP URL unless one is explicitly configured.

### “Can permissions be limited by organisation?”

Target-scoped authorization is implemented for certificate issuance. Most other
guarded routes currently use global permission resolution. Generalising resource
scope across all routes is documented future authorization work.

### “What prevents document files from disappearing?”

Local Compose uses mounted storage and the database retains document metadata.
Production must provide durable object storage or equivalent, backup and recovery,
integrity monitoring, access policy, and retention aligned to organisational rules.

---

## 18. Demo recovery plan

If the portal becomes unavailable:

1. Do not debug silently in front of the audience.
2. State: “The local presentation environment is unavailable; I will show the
   same controls using the prepared evidence.”
3. Use screenshots or a recording from rehearsal.
4. Show the stamped PDF and explain its seal and QR.
5. Use prepared API outputs for the approved entity, certificate verification,
   document verification, and audit event.

If the API rate limit returns HTTP 429:

- Stop repeated clicking.
- Move to the staff prototype or architecture discussion.
- Return to the affected endpoint after the 60-second window.

If a camera/QR scanner is blocked:

- Enter the certificate serial manually.
- Open the QR target URL directly.
- Explain that browsers require camera permission and usually HTTPS outside
  localhost.

If fixture state becomes confusing:

- Refreshing the Angular application recreates the fixture service state.
- Reintroduce the section as a UI workflow prototype before continuing.

---

## 19. Short 10-minute version

When time is limited:

1. **Opening (1 min):** identity → governed approval → credential → verifiable
   document → audit.
2. **Dashboard and approved entity (2 min):** show profile and completed case.
3. **Four-eyes and RBAC (2 min):** explain distinct roles and server-side gates.
4. **Certificate and public verification (2 min):** verify a prepared serial.
5. **Stamped document (2 min):** explain render-then-sign and tamper upload.
6. **Close (1 min):** identify staff API integration and production hardening as
   the next delivery stage.

Do not spend the short version creating records live. Use prepared data and focus
on the chain of trust.

---

## 20. After the demonstration

Record:

- attendees and decision-makers;
- requested pilot department(s);
- document classes selected for the pilot;
- required reviewer and approver policy;
- integration dependencies;
- compliance, retention, and data-residency requirements;
- production CA/HSM ownership;
- acceptance criteria and target date;
- every question that could not be answered during the session.

Turn those items into an agreed pilot scope. Avoid treating positive verbal
feedback as acceptance without named owners and measurable criteria.
