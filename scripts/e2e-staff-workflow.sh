#!/usr/bin/env bash
#
# Sprints 4 and 5: what a staff member actually does.
#
# Sign on your own authority, ask others to sign, recall one document without
# revoking a key, replace it with a corrected version — and get your department's
# seal by asking for it, having your manager review it and your head of
# department release it.
#
# The four-eyes rule under test is NOT a pool of reviewers. It is the
# requester's own line manager and their unit's head, resolved from the org
# chart, and the assertions below pin that: the head cannot skip the review, the
# reviewer cannot release the seal, and a bystander can do neither.
#
# Usage: bash scripts/e2e-staff-workflow.sh [baseUrl]
# Requirements: bash, curl, python3.

set -uo pipefail

BASE="${1:-http://localhost:8080}"
ADMIN_USER="${AUTH_USERNAME:-admin}"
ADMIN_PASS="${AUTH_PASSWORD:-change_me_admin_password}"
SUFFIX="$(date +%s)"
PW='Staff-Workflow!Regression1'
WORK="$(mktemp -d)"
PASS=0
FAIL=0
trap 'rm -rf "$WORK"' EXIT

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
head2() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok()    { PASS=$((PASS + 1)); green "  PASS  $1"; }
bad()   { FAIL=$((FAIL + 1)); red   "  FAIL  $1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; }
assert_eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi; }
assert_contains() { case "$3" in *"$2"*) ok "$1" ;; *) bad "$1" "'$2' not in: $(printf '%s' "$3" | head -c 200)" ;; esac; }

jq_get() {
  printf '%s' "$1" | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
for k in '$2'.split('.'):
    if isinstance(d, list): d = d[int(k)] if k.isdigit() and int(k) < len(d) else None
    elif isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print('' if d is None else (d if isinstance(d, str) else json.dumps(d)))
"
}

THROTTLE_WAIT="${THROTTLE_WAIT:-62}"

as() {
  local tok="$1" body
  body=$(curl -s -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"})
  case "$body" in
    *ThrottlerException*)
      printf '\033[2m  (rate-limit window hit — waiting %ss)\033[0m\n' "$THROTTLE_WAIT" >&2
      sleep "$THROTTLE_WAIT"
      curl -s -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"} ;;
    *) printf '%s' "$body" ;;
  esac
}
as_code() {
  local tok="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"})
  if [ "$code" = "429" ]; then
    sleep "$THROTTLE_WAIT"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"})
  fi
  printf '%s' "$code"
}
login() {
  curl -s -X POST "$BASE/v1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))'
}
api() { as "$ADMIN" "$@"; }

head2 "Setup: an approved organisation with a Finance department and a key"
ADMIN=$(login "$ADMIN_USER" "$ADMIN_PASS")
[ -n "$ADMIN" ] && ok "authenticated" || { red "cannot authenticate"; exit 1; }

ENTITY_ID=$(jq_get "$(api POST /v1/entities "{\"name\":\"StampCo $SUFFIX\",\"country\":\"LS\",\"entityType\":\"ORGANISATION\"}")" id)
api POST "/v1/entities/$ENTITY_ID/org-profile" \
  "{\"legalName\":\"StampCo (Pty) Ltd\",\"registrationNumber\":\"LS/$SUFFIX\",\"registrationCountry\":\"LS\",\"businessType\":\"PRIVATE_LIMITED\",\"regAddressLine1\":\"7 Griffith Rd\",\"regCity\":\"Maseru\",\"regCountry\":\"LS\"}" >/dev/null

approve_case() { # entityId caseType note
  local cid
  cid=$(jq_get "$(api POST /v1/verification-cases "{\"entityId\":\"$1\",\"caseType\":\"$2\"}")" id)
  printf 'evidence\n' > "$WORK/ev.txt"
  curl -s -X POST "$BASE/v1/verification-cases/$cid/evidence" -H "Authorization: Bearer $ADMIN" \
    -F "file=@$WORK/ev.txt;type=text/plain" -F "documentType=$3" >/dev/null
  api PATCH "/v1/verification-cases/$cid/submit" '{}' >/dev/null
  api PATCH "/v1/verification-cases/$cid/assign" '{}' >/dev/null
  api PATCH "/v1/verification-cases/$cid/review" '{"reviewNotes":"Verified for the staff workflow regression."}' >/dev/null
  api PATCH "/v1/verification-cases/$cid/approve" '{}' >/dev/null
}
approve_case "$ENTITY_ID" KYB COMPANY_CERTIFICATE
assert_eq "the organisation is APPROVED" "APPROVED" "$(jq_get "$(api GET "/v1/entities/$ENTITY_ID")" status)"

ROOT_ID=$(jq_get "$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"ORGANISATION\",\"name\":\"StampCo\"}")" id)
DIV_ID=$(jq_get "$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DIVISION\",\"name\":\"Corporate\",\"parentId\":\"$ROOT_ID\"}")" id)
FIN_ID=$(jq_get "$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Finance\",\"code\":\"FIN\",\"parentId\":\"$DIV_ID\"}")" id)
UNIT_SERIAL=$(jq_get "$(api POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$FIN_ID\"}")" serial)
[ -n "$UNIT_SERIAL" ] && ok "Finance holds a signing key ($UNIT_SERIAL)" || { red "unit key failed"; exit 1; }

STAFF_ROLE=$(api GET /v1/roles | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    if r.get('code') == 'STAFF': print(r['id']); break")
[ -n "$STAFF_ROLE" ] && ok "the Staff role is seeded" || bad "Staff role seeded"

make_person() { # slug "First Last" -> userId|personEntityId
  local u="$1-$SUFFIX" uid pid
  uid=$(jq_get "$(api POST /v1/users "{\"username\":\"$u\",\"email\":\"$u@example.test\",\"displayName\":\"$2\",\"password\":\"$PW\"}")" id)
  api POST "/v1/users/$uid/roles" "{\"roleId\":\"$STAFF_ROLE\"}" >/dev/null
  pid=$(jq_get "$(api POST /v1/entities "{\"name\":\"$2\",\"country\":\"LS\",\"entityType\":\"PERSON\"}")" id)
  api POST "/v1/entities/$pid/person-profile" \
    "{\"firstName\":\"${2%% *}\",\"lastName\":\"${2##* }\",\"dateOfBirth\":\"1990-01-01\",\"nationality\":\"LS\",\"idType\":\"NATIONAL_ID\",\"idNumber\":\"ID-$u\",\"addressLine1\":\"1 Kingsway\",\"city\":\"Maseru\",\"addressCountry\":\"LS\"}" >/dev/null
  approve_case "$pid" KYC PASSPORT
  printf '%s|%s' "$uid" "$pid"
}

IFS='|' read -r THABO THABO_P <<EOF
$(make_person thabo "Thabo Mokoena")
EOF
IFS='|' read -r PALESA PALESA_P <<EOF
$(make_person palesa "Palesa Khoeli")
EOF
IFS='|' read -r LINEO LINEO_P <<EOF
$(make_person lineo "Lineo Ranthithi")
EOF
IFS='|' read -r NTHABI NTHABI_P <<EOF
$(make_person nthabi "Nthabiseng Molapo")
EOF

api PATCH "/v1/users/$LINEO/placement"  "{\"personEntityId\":\"$LINEO_P\",\"orgUnitId\":\"$FIN_ID\"}" >/dev/null
api PATCH "/v1/users/$PALESA/placement" "{\"personEntityId\":\"$PALESA_P\",\"orgUnitId\":\"$FIN_ID\",\"managerId\":\"$LINEO\"}" >/dev/null
api PATCH "/v1/users/$THABO/placement"  "{\"personEntityId\":\"$THABO_P\",\"orgUnitId\":\"$FIN_ID\",\"managerId\":\"$PALESA\"}" >/dev/null
api PATCH "/v1/users/$NTHABI/placement" "{\"personEntityId\":\"$NTHABI_P\",\"orgUnitId\":\"$FIN_ID\",\"managerId\":\"$PALESA\"}" >/dev/null
api PATCH "/v1/org-units/$FIN_ID/head" "{\"headUserId\":\"$LINEO\"}" >/dev/null
api POST "/v1/users/$THABO/signing-key" >/dev/null
api POST "/v1/users/$PALESA/signing-key" >/dev/null

T=$(login "thabo-$SUFFIX" "$PW"); P=$(login "palesa-$SUFFIX" "$PW")
L=$(login "lineo-$SUFFIX" "$PW"); N=$(login "nthabi-$SUFFIX" "$PW")
[ -n "$T" ] && [ -n "$P" ] && [ -n "$L" ] && [ -n "$N" ] && ok "four staff logins work" || { red "staff logins failed"; exit 1; }

CHAIN=$(as "$T" GET /v1/me/approval-chain)
assert_eq "Thabo's reviewer is his own line manager" "Palesa Khoeli" "$(jq_get "$CHAIN" reviewer.displayName)"
assert_eq "Thabo's approver is the head of his department" "Lineo Ranthithi" "$(jq_get "$CHAIN" approver.displayName)"
assert_eq "so he can raise a stamp request" "true" "$(jq_get "$CHAIN" canRequestStamp)"

# ── WP-4.1 ───────────────────────────────────────────────────────────────────
head2 "WP-4.1 — signing on your own authority"

base64 -d scripts/fixtures/sample-invoice.pdf.b64 > "$WORK/invoice.pdf" 2>/dev/null \
  || cp scripts/fixtures/sample-invoice.pdf.b64 "$WORK/invoice.pdf"

DOC=$(curl -s -X POST "$BASE/v1/documents" -H "Authorization: Bearer $T" \
  -F "file=@$WORK/invoice.pdf;type=application/pdf" -F "name=Invoice INV-$SUFFIX.pdf" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
[ -n "$DOC" ] && ok "Thabo brings a document onto the platform" || { red "upload failed"; exit 1; }

SIGNED=$(as "$T" POST "/v1/documents/$DOC/sign" '{}')
assert_eq "signing it moves it to SIGNED" "SIGNED" "$(jq_get "$SIGNED" standing)"
assert_contains "the trail records who signed" "Thabo Mokoena" "$(jq_get "$SIGNED" trail)"
assert_contains "and that it was their own key" "personal key" "$(jq_get "$SIGNED" trail)"
assert_eq "signing twice is refused" "422" "$(as_code "$T" POST "/v1/documents/$DOC/sign" '{}')"

assert_eq "a colleague cannot even see someone else's document" "404" \
  "$(as_code "$N" GET "/v1/documents/$DOC")"

# ── WP-4.2 ───────────────────────────────────────────────────────────────────
head2 "WP-4.2 — asking other people to sign"

DOC2=$(curl -s -X POST "$BASE/v1/documents" -H "Authorization: Bearer $T" \
  -F "file=@$WORK/invoice.pdf;type=application/pdf" -F "name=Service agreement $SUFFIX.pdf" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')

as "$T" POST "/v1/documents/$DOC2/signature-requests" "{\"signerIds\":[\"$PALESA\",\"$NTHABI\"]}" >/dev/null
SENT=$(as "$T" GET /v1/me/sent)
assert_contains "the sender sees how many have signed" "0 of 2 signed" "$SENT"

PQ=$(as "$P" GET /v1/me/awaiting)
assert_contains "it lands in the signer's queue" "Service agreement" "$PQ"
assert_contains "flagged as something to sign" "SIGN" "$PQ"

assert_eq "asking yourself is refused" "400" \
  "$(as "$T" POST "/v1/documents/$DOC2/signature-requests" "{\"signerIds\":[\"$THABO\"]}" >/dev/null; as_code "$T" POST "/v1/documents/$DOC2/signature-requests" "{\"signerIds\":[\"$THABO\"]}")"

as "$P" POST "/v1/documents/$DOC2/sign" '{}' >/dev/null
assert_contains "the count moves as people sign" "1 of 2 signed" "$(as "$T" GET /v1/me/sent)"

as "$N" PATCH "/v1/documents/$DOC2/decline" '{"reason":"This is not mine to sign"}' >/dev/null
DECLINED=$(as "$T" GET /v1/me/sent)
assert_contains "a decline is reported with who declined" "Declined by Nthabiseng" "$DECLINED"
assert_contains "the trail keeps the reason" "not mine to sign" "$(jq_get "$(as "$T" GET "/v1/documents/$DOC2")" trail)"

# ── WP-5.1 / 5.2 ─────────────────────────────────────────────────────────────
head2 "WP-5.1 and 5.2 — the request travels the reporting line"

SR=$(jq_get "$(as "$T" POST /v1/stamp-requests "{\"documentId\":\"$DOC\"}")" id)
[ -n "$SR" ] && ok "Thabo raises a stamp request" || { red "stamp request failed"; exit 1; }
assert_eq "it starts as a draft" "DRAFT" "$(jq_get "$(as "$T" GET "/v1/stamp-requests/$SR")" status)"

SUBMITTED=$(as "$T" PATCH "/v1/stamp-requests/$SR/submit" '{}')
assert_eq "submitting sends it for review" "AWAITING_REVIEW" "$(jq_get "$SUBMITTED" status)"
assert_contains "the chain names the reviewer as the line manager" "your line manager" "$(jq_get "$SUBMITTED" chain)"
assert_contains "and the approver as the head of the department" "head of Finance" "$(jq_get "$SUBMITTED" chain)"

assert_contains "it appears in the reviewer's queue" "REVIEW" "$(as "$P" GET /v1/me/awaiting)"

# Four eyes, bound to the chart rather than to a pool.
assert_eq "the head cannot skip the review step" "403" \
  "$(as_code "$L" PATCH "/v1/stamp-requests/$SR/approve" '{}')"
assert_eq "a bystander cannot act on it" "404" \
  "$(as_code "$N" PATCH "/v1/stamp-requests/$SR/approve" '{}')"
assert_eq "and cannot even read it" "404" "$(as_code "$N" GET "/v1/stamp-requests/$SR")"

REVIEWED=$(as "$P" PATCH "/v1/stamp-requests/$SR/approve" '{"note":"Checked against the purchase order."}')
assert_eq "the line manager reviews it" "AWAITING_APPROVAL" "$(jq_get "$REVIEWED" status)"
assert_contains "and is told where it went next" "Lineo Ranthithi" "$(jq_get "$REVIEWED" message)"

assert_eq "the reviewer cannot then release the seal" "403" \
  "$(as_code "$P" PATCH "/v1/stamp-requests/$SR/approve" '{}')"

# ── WP-5.3 ───────────────────────────────────────────────────────────────────
head2 "WP-5.3 — approval releases the department key"

APPROVED=$(as "$L" PATCH "/v1/stamp-requests/$SR/approve" '{"note":"Approved for payment."}')
assert_eq "the head of department releases the seal" "STAMPED" "$(jq_get "$APPROVED" status)"
assert_contains "the message names the seal that was applied" "Finance seal" "$(jq_get "$APPROVED" message)"

DETAIL=$(as "$T" GET "/v1/documents/$DOC")
assert_eq "the document is now stamped" "STAMPED" "$(jq_get "$DETAIL" standing)"
assert_eq "with the DEPARTMENT's key, not a person's" "$UNIT_SERIAL" "$(jq_get "$DETAIL" certificate.serial)"
assert_contains "and the certificate is named as the department's" "department key" "$(jq_get "$DETAIL" certificate.holder)"
assert_eq "the seal is a department seal" "DEPARTMENT" "$(jq_get "$DETAIL" seal.level)"
assert_eq "carrying the unit's short code" "FIN" "$(jq_get "$DETAIL" seal.unitCode)"

VID=$(jq_get "$DETAIL" verificationId)
[ -n "$VID" ] && ok "a verification id was issued ($VID)" || bad "verification id issued"

# ── WP-5.4 ───────────────────────────────────────────────────────────────────
head2 "WP-5.4 — verification shows the authority behind the seal"

PUBLIC=$(curl -s "$BASE/v1/verify/document/$VID")
assert_eq "anyone can check it without logging in" "VALID" "$(jq_get "$PUBLIC" status)"
assert_eq "the issuer is the unit, not the company in general" "ORG_UNIT" "$(jq_get "$PUBLIC" issuer.holder)"
assert_eq "named as the department" "Finance" "$(jq_get "$PUBLIC" issuer.name)"
assert_contains "with the organisation behind it" "StampCo" "$(jq_get "$PUBLIC" issuer.organisation)"
assert_eq "the checker sees who asked for it" "Thabo Mokoena" "$(jq_get "$PUBLIC" releasedBy.requestedBy.displayName)"
assert_eq "who reviewed it" "Palesa Khoeli" "$(jq_get "$PUBLIC" releasedBy.reviewedBy.displayName)"
assert_eq "and who released the seal" "Lineo Ranthithi" "$(jq_get "$PUBLIC" releasedBy.approvedBy.displayName)"

# ── WP-4.3 ───────────────────────────────────────────────────────────────────
head2 "WP-4.3 — recall withdraws one document, not a key"

RECALLED=$(as "$T" PATCH "/v1/documents/$DOC/recall" '{"reason":"Wrong VAT rate applied"}')
assert_eq "the document is recalled" "RECALLED" "$(jq_get "$RECALLED" standing)"
assert_contains "the reason is kept" "Wrong VAT rate" "$(jq_get "$RECALLED" recall)"
assert_eq "it cannot be recalled twice" "422" "$(as_code "$T" PATCH "/v1/documents/$DOC/recall" '{"reason":"again"}')"

assert_eq "THE POINT: the department key is untouched" "GOOD" \
  "$(jq_get "$(curl -s "$BASE/v1/certificates/$UNIT_SERIAL/status")" status)"

assert_eq "only the owner may recall" "403" \
  "$(as_code "$P" PATCH "/v1/documents/$DOC2/recall" '{"reason":"not mine"}')"

# ── WP-4.4 ───────────────────────────────────────────────────────────────────
head2 "WP-4.4 — replace with a corrected version"

NEW_DOC=$(curl -s -X POST "$BASE/v1/documents/$DOC/replace" -H "Authorization: Bearer $T" \
  -F "file=@$WORK/invoice.pdf;type=application/pdf" -F "name=Invoice INV-$SUFFIX-corrected.pdf" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
[ -n "$NEW_DOC" ] && ok "a corrected version is uploaded" || bad "replacement uploaded"

OLD=$(as "$T" GET "/v1/documents/$DOC")
assert_contains "the old document points at its replacement" "corrected" "$(jq_get "$OLD" supersededBy)"
assert_eq "and STAYS recalled, so the reason is not lost" "RECALLED" "$(jq_get "$OLD" standing)"

MINE=$(as "$T" GET /v1/me/documents)
assert_contains "the list says both what happened and where the good copy is" "Wrong VAT rate" "$MINE"
assert_contains "including the replacement's name" "corrected" "$MINE"

assert_eq "replacing twice is refused" "422" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/documents/$DOC/replace" -H "Authorization: Bearer $T" -F "file=@$WORK/invoice.pdf;type=application/pdf")"

printf '\n\033[1m── Result ──\033[0m\n'
green "  passed: $PASS"
[ "$FAIL" -gt 0 ] && red "  failed: $FAIL"
printf '\n'
[ "$FAIL" -eq 0 ]
