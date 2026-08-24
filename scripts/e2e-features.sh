#!/usr/bin/env bash
#
# End-to-end regression for the post-Phase-1-B feature blocks:
#
#   F1  signing & signature verification (HSM-backed)
#   F2  trust distribution — CA chain, CRL, certificate status
#   F4  certificate lifecycle — list/filter, expiry window, renew + rotate
#   F5  document stamping — visible seal + QR, tamper detection, public verify
#   F6  issued-certificate extensions — CRL distribution point, AIA
#   R1  regression: /v1/objects reachable (permission-seed collision repair)
#
# The Phase 1-B lifecycle itself (KYC/KYB, 4-eyes, RBAC negatives) is covered by
# e2e-phase-1b.sh — this script sets an entity up the short way and then exercises
# everything built on top of it.
#
# Requires FOUR_EYES_ADMIN_OVERRIDE=true (the dev default): the admin walks the
# verification case through create -> submit -> review -> approve alone.
#
# Usage: bash scripts/e2e-features.sh [baseUrl]
#        bash scripts/e2e-features.sh http://localhost:8080
#
# Requirements: bash, curl, openssl, python3, sha256sum (or shasum).

set -uo pipefail

BASE="${1:-http://localhost:8080}"
ADMIN_USER="${AUTH_USERNAME:-admin}"
ADMIN_PASS="${AUTH_PASSWORD:-change_me_admin_password}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_B64="$SCRIPT_DIR/fixtures/sample-invoice.pdf.b64"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
SUFFIX="$(date +%s)"

# ── helpers ───────────────────────────────────────────────────────────────────

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
head2() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

ok()   { PASS=$((PASS + 1)); green "  PASS  $1"; }
bad()  { FAIL=$((FAIL + 1)); red   "  FAIL  $1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; }

assert_eq() { # label expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi
}

assert_contains() { # label needle haystack
  case "$3" in *"$2"*) ok "$1" ;; *) bad "$1" "'$2' not found in: $(printf '%s' "$3" | head -c 200)" ;; esac
}

jq_get() { # jsonString key -> value ('' when absent)
  printf '%s' "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for k in '$2'.split('.'):
    if isinstance(d, list):
        d = d[int(k)] if k.isdigit() and int(k) < len(d) else None
    elif isinstance(d, dict):
        d = d.get(k)
    else:
        d = None
    if d is None:
        break
# json.dumps everything except strings, so booleans read as true/false
print('' if d is None else (d if isinstance(d, str) else json.dumps(d)))
"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

api()      { curl -s -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${3:+-d "$3"}; }
api_code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN"; }

# ── 0. authenticate ───────────────────────────────────────────────────────────

head2 "Setup"

LOGIN=$(curl -s -X POST "$BASE/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
TOKEN=$(jq_get "$LOGIN" accessToken)
if [ -z "$TOKEN" ]; then
  red "Could not authenticate as $ADMIN_USER against $BASE — aborting."
  printf '%s\n' "$LOGIN"
  exit 1
fi
ok "authenticated as $ADMIN_USER"

# ── 1. an APPROVED entity with an HSM-managed certificate ─────────────────────

ENTITY=$(api POST /v1/entities "{\"name\":\"Feature Test Co $SUFFIX\",\"country\":\"LS\",\"entityType\":\"ORGANISATION\"}")
ENTITY_ID=$(jq_get "$ENTITY" id)
[ -n "$ENTITY_ID" ] && ok "entity created ($ENTITY_ID)" || { bad "entity created" "$ENTITY"; exit 1; }

api POST "/v1/entities/$ENTITY_ID/org-profile" \
  "{\"legalName\":\"Feature Test Co (Pty) Ltd\",\"registrationNumber\":\"LS/$SUFFIX\",\"registrationCountry\":\"LS\",\"businessType\":\"PRIVATE_LIMITED\",\"regAddressLine1\":\"7 Griffith Rd\",\"regCity\":\"Maseru\",\"regCountry\":\"LS\"}" >/dev/null

CASE=$(api POST /v1/verification-cases "{\"entityId\":\"$ENTITY_ID\",\"caseType\":\"KYB\"}")
CASE_ID=$(jq_get "$CASE" id)
[ -n "$CASE_ID" ] || { bad "verification case created" "$CASE"; exit 1; }

printf 'Company registration certificate (test fixture)\n' > "$WORK/company.txt"
curl -s -X POST "$BASE/v1/verification-cases/$CASE_ID/evidence" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$WORK/company.txt;type=text/plain" \
  -F "documentType=COMPANY_CERTIFICATE" >/dev/null

api PATCH "/v1/verification-cases/$CASE_ID/submit" >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/assign" '{}' >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/review" '{"reviewNotes":"Verified for feature e2e."}' >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/approve" >/dev/null

ENTITY_AFTER=$(api GET "/v1/entities/$ENTITY_ID")
assert_eq "entity reaches APPROVED" "APPROVED" "$(jq_get "$ENTITY_AFTER" status)"

CERT1=$(api POST /v1/cert-requests/managed "{\"entityId\":\"$ENTITY_ID\"}")
SERIAL1=$(jq_get "$CERT1" serial)
[ -n "$SERIAL1" ] && ok "HSM-managed certificate issued (serial $SERIAL1)" \
  || { bad "HSM-managed certificate issued" "$CERT1"; exit 1; }

# ── F6. issued-certificate extensions ─────────────────────────────────────────

head2 "F6 — certificate extensions (CRL distribution point, AIA)"

CERT1_JSON=$(api GET "/v1/certificates/$SERIAL1")
jq_get "$CERT1_JSON" certPem > "$WORK/cert1.pem"
CERT_TEXT=$(openssl x509 -in "$WORK/cert1.pem" -noout -text 2>/dev/null)

assert_contains "certificate carries a CRL distribution point" "X509v3 CRL Distribution Points" "$CERT_TEXT"
assert_contains "CRL DP points at the published CRL"          "/v1/crl.pem"                    "$CERT_TEXT"
assert_contains "certificate carries Authority Information Access" "Authority Information Access" "$CERT_TEXT"
assert_contains "AIA publishes the issuer chain"              "/v1/ca/chain"                   "$CERT_TEXT"
assert_contains "end-entity constraint still enforced"        "CA:FALSE"                       "$CERT_TEXT"

# A CSR is untrusted input: valid SANs are re-emitted, everything else is dropped.
cat > "$WORK/san.cnf" <<'SANCNF'
[req]
distinguished_name = dn
req_extensions = exts
prompt = no
[dn]
C = LS
O = Feature Test Co (Pty) Ltd
CN = portal.featuretest.ls
[exts]
subjectAltName = DNS:portal.featuretest.ls, email:ops@featuretest.ls, DNS:!!!not-a-host!!!
basicConstraints = critical, CA:true
SANCNF

openssl genrsa -out "$WORK/san.key" 2048 2>/dev/null
openssl req -new -key "$WORK/san.key" -out "$WORK/san.csr" -config "$WORK/san.cnf" 2>/dev/null
SAN_CSR_JSON=$(python3 -c "import json;print(json.dumps(open('$WORK/san.csr').read()))")

SAN_REQ=$(api POST /v1/cert-requests "{\"csrPem\":$SAN_CSR_JSON,\"entityId\":\"$ENTITY_ID\"}")
SAN_REQ_ID=$(jq_get "$SAN_REQ" id)
SAN_CERT=$(api POST "/v1/cert-requests/$SAN_REQ_ID/issue")
jq_get "$SAN_CERT" certPem > "$WORK/san-issued.pem"
SAN_TEXT=$(openssl x509 -in "$WORK/san-issued.pem" -noout -text 2>/dev/null)

assert_contains "requested DNS SAN is honoured"   "DNS:portal.featuretest.ls" "$SAN_TEXT"
assert_contains "requested email SAN is honoured" "email:ops@featuretest.ls"  "$SAN_TEXT"

if printf '%s' "$SAN_TEXT" | grep -q 'not-a-host'; then
  bad "malformed SAN entry is dropped" "'!!!not-a-host!!!' was copied into the certificate"
else
  ok "malformed SAN entry is dropped"
fi

if printf '%s' "$SAN_TEXT" | grep -q 'CA:TRUE'; then
  bad "CSR cannot inject basicConstraints CA:true" "the issued certificate is a CA certificate"
else
  ok "CSR cannot inject basicConstraints CA:true"
fi

# ── F2. trust distribution ────────────────────────────────────────────────────

head2 "F2 — trust distribution"

CHAIN=$(curl -s "$BASE/v1/ca/chain")
assert_contains "CA chain is downloadable without auth" "BEGIN CERTIFICATE" "$CHAIN"

CRL=$(curl -s "$BASE/v1/crl.pem")
assert_contains "CRL is downloadable without auth" "BEGIN X509 CRL" "$CRL"

STATUS1=$(curl -s "$BASE/v1/certificates/$SERIAL1/status")
assert_eq "fresh certificate status is GOOD" "GOOD" "$(jq_get "$STATUS1" status)"

# ── F1. signing & verification ────────────────────────────────────────────────

head2 "F1 — signing and signature verification"

PAYLOAD_B64=$(printf 'feature-test-payload-%s' "$SUFFIX" | base64 | tr -d '\n')
SIGN=$(api POST /v1/signatures "{\"entityId\":\"$ENTITY_ID\",\"payloadB64\":\"$PAYLOAD_B64\",\"documentName\":\"feature-test.txt\"}")
SIG_B64=$(jq_get "$SIGN" signatureB64)
[ -n "$SIG_B64" ] && ok "content signed with the entity HSM key" || bad "content signed" "$SIGN"

SIG_JSON=$(printf '%s' "$SIGN" | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin)["signatureB64"]))')
SIG_SERIAL=$(jq_get "$SIGN" certSerial)

# Pass certSerial: the entity now holds more than one certificate (the managed
# signing key and the CSR-issued SAN certificate), and only one of them signed.
VERIFY=$(api POST /v1/signatures/verify \
  "{\"certSerial\":\"$SIG_SERIAL\",\"payloadB64\":\"$PAYLOAD_B64\",\"signatureB64\":$SIG_JSON}")
assert_eq "signature verifies against the signing certificate" "true" "$(jq_get "$VERIFY" valid)"

# ...and the entityId shortcut must land on the HSM key, not the newest cert.
VERIFY_BY_ENTITY=$(api POST /v1/signatures/verify \
  "{\"entityId\":\"$ENTITY_ID\",\"payloadB64\":\"$PAYLOAD_B64\",\"signatureB64\":$SIG_JSON}")
assert_eq "entityId shortcut resolves to the HSM signing key" "true" "$(jq_get "$VERIFY_BY_ENTITY" valid)"

# ── F5. document stamping ─────────────────────────────────────────────────────

head2 "F5 — document stamping"

base64 -d "$FIXTURE_B64" > "$WORK/invoice.pdf" 2>/dev/null || base64 -D "$FIXTURE_B64" > "$WORK/invoice.pdf"
assert_contains "PDF fixture decoded" "%PDF" "$(head -c 5 "$WORK/invoice.pdf")"

STAMP=$(curl -s -X POST "$BASE/v1/stamps" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$WORK/invoice.pdf;type=application/pdf" \
  -F "entityId=$ENTITY_ID" \
  -F "documentName=invoice-$SUFFIX.pdf")

STAMP_ID=$(jq_get "$STAMP" id)
VERIFICATION_ID=$(jq_get "$STAMP" verificationId)
STAMPED_HASH=$(jq_get "$STAMP" stampedHash)

[ -n "$STAMP_ID" ] && ok "document stamped ($VERIFICATION_ID)" || { bad "document stamped" "$STAMP"; }
assert_eq "visible seal rendered onto the PDF" "true" "$(jq_get "$STAMP" visibleStamp)"
assert_eq "stamp is bound to the signing certificate" "$SERIAL1" "$(jq_get "$STAMP" certSerial)"

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/stamps/$STAMP_ID/download" -o "$WORK/stamped.pdf"
assert_eq "downloaded file hashes to the signed bytes" "$STAMPED_HASH" "$(sha256_of "$WORK/stamped.pdf")"
assert_contains "stamped artifact is still a PDF" "%PDF" "$(head -c 5 "$WORK/stamped.pdf")"

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/stamps/$STAMP_ID/qr.png" -o "$WORK/qr.png"
assert_eq "QR code renders as PNG" "PNG" "$(head -c 4 "$WORK/qr.png" | tail -c 3)"

# Public verification by ID (the QR target)
BYID=$(curl -s -H 'Accept: application/json' "$BASE/v1/verify/document/$VERIFICATION_ID")
assert_eq "public verify by ID reports VALID" "VALID" "$(jq_get "$BYID" status)"
assert_eq "public verify by ID needs no auth"  "$ENTITY_ID" "$(jq_get "$BYID" issuer.entityId)"

# The QR is scanned by a phone: the same URL must answer with a page
HTML=$(curl -s -H 'Accept: text/html' "$BASE/v1/verify/document/$VERIFICATION_ID")
assert_contains "QR scan target renders an HTML result page" "AUTHENTIC" "$HTML"

# Authoritative check: upload the file itself
UPLOADED=$(curl -s -X POST "$BASE/v1/verify/document" -F "file=@$WORK/stamped.pdf;type=application/pdf")
assert_eq "uploaded stamped document verifies" "VALID" "$(jq_get "$UPLOADED" status)"

# Tamper detection
cp "$WORK/stamped.pdf" "$WORK/tampered.pdf"
printf '%% edited after stamping\n' >> "$WORK/tampered.pdf"
TAMPERED=$(curl -s -X POST "$BASE/v1/verify/document" \
  -F "file=@$WORK/tampered.pdf;type=application/pdf" \
  -F "verificationId=$VERIFICATION_ID")
assert_eq "edited document is reported TAMPERED" "TAMPERED" "$(jq_get "$TAMPERED" status)"
assert_eq "edited document is not valid" "false" "$(jq_get "$TAMPERED" valid)"

printf 'never stamped by this platform\n' > "$WORK/unknown.txt"
UNKNOWN=$(curl -s -X POST "$BASE/v1/verify/document" -F "file=@$WORK/unknown.txt;type=text/plain")
assert_eq "unstamped document is reported NO_MATCHING_STAMP" "NO_MATCHING_STAMP" "$(jq_get "$UNKNOWN" status)"

# ── F4. certificate lifecycle ─────────────────────────────────────────────────

head2 "F4 — certificate lifecycle"

LIST=$(api GET "/v1/certificates?entityId=$ENTITY_ID")
assert_contains "certificate list filters by entity" "$SERIAL1" "$LIST"
assert_contains "list reports a computed status"     "GOOD"     "$LIST"

EXPIRING=$(api GET "/v1/certificates?expiringInDays=400")
assert_contains "expiry window surfaces the 398-day certificate" "$SERIAL1" "$EXPIRING"

NEAR=$(api GET "/v1/certificates?expiringInDays=1")
if printf '%s' "$NEAR" | grep -q "$SERIAL1"; then
  bad "a fresh certificate is outside the 1-day expiry window" "$SERIAL1 was returned"
else
  ok "a fresh certificate is outside the 1-day expiry window"
fi

RENEW=$(api POST /v1/certificates/renew "{\"entityId\":\"$ENTITY_ID\",\"revokePrevious\":true}")
SERIAL2=$(jq_get "$RENEW" renewed.serial)
[ -n "$SERIAL2" ] && [ "$SERIAL2" != "$SERIAL1" ] \
  && ok "renewal issued a new certificate (serial $SERIAL2)" \
  || bad "renewal issued a new certificate" "$RENEW"
assert_contains "previous certificate was superseded" "$SERIAL1" "$(jq_get "$RENEW" revokedPrevious)"

STATUS_OLD=$(curl -s "$BASE/v1/certificates/$SERIAL1/status")
assert_eq "superseded certificate reports REVOKED" "REVOKED" "$(jq_get "$STATUS_OLD" status)"
STATUS_NEW=$(curl -s "$BASE/v1/certificates/$SERIAL2/status")
assert_eq "renewed certificate reports GOOD" "GOOD" "$(jq_get "$STATUS_NEW" status)"

AUDIT=$(api GET "/v1/audit-logs?event=CERTIFICATE_RENEWED&limit=20")
assert_contains "renewal is recorded in the audit trail" "$SERIAL2" "$AUDIT"

# Revocation must propagate to documents already stamped with that key
AFTER_REVOKE=$(curl -s -X POST "$BASE/v1/verify/document" -F "file=@$WORK/stamped.pdf;type=application/pdf")
assert_eq "document stamped with a now-revoked certificate reports CERTIFICATE_REVOKED" \
  "CERTIFICATE_REVOKED" "$(jq_get "$AFTER_REVOKE" status)"

# ── R1. permission-seed repair ────────────────────────────────────────────────

head2 "R1 — regression: object routes reachable"

assert_eq "GET /v1/objects is authorised for ADMIN" "200" "$(api_code GET /v1/objects)"

OBJ=$(api POST /v1/objects "{\"objectType\":\"DOCUMENT\",\"reference\":\"INV-$SUFFIX\",\"entityId\":\"$ENTITY_ID\"}")
OBJ_ID=$(jq_get "$OBJ" id)
[ -n "$OBJ_ID" ] && ok "object record created" || bad "object record created" "$OBJ"

# An object can carry a stamped artifact — the issuer/object link the platform promises
if [ -n "$OBJ_ID" ]; then
  OBJ_STAMP=$(curl -s -X POST "$BASE/v1/stamps" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$WORK/invoice.pdf;type=application/pdf" \
    -F "entityId=$ENTITY_ID" \
    -F "objectId=$OBJ_ID" \
    -F "documentName=object-linked-$SUFFIX.pdf")
  assert_eq "stamp can be linked to an object record" "$OBJ_ID" "$(jq_get "$OBJ_STAMP" objectId)"
fi

# ── summary ───────────────────────────────────────────────────────────────────

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  green "All $PASS assertions passed."
  exit 0
else
  red "$FAIL of $((PASS + FAIL)) assertions failed."
  exit 1
fi
