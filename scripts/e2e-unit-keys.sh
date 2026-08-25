#!/usr/bin/env bash
#
# Sprint 3 regression: keys held by organisational units.
#
# A department stamp must be signed with the DEPARTMENT's key, not with the key
# of whoever approved it — otherwise the stamp stops verifying the day that head
# leaves, and revoking a departed person's key invalidates every stamp they ever
# released. That needs a certificate whose holder is a unit, which the platform
# could not issue before WP-3.1.
#
# Usage: bash scripts/e2e-unit-keys.sh [baseUrl]
# Requirements: bash, curl, python3, openssl.

set -uo pipefail

BASE="${1:-http://localhost:8080}"
ADMIN_USER="${AUTH_USERNAME:-admin}"
ADMIN_PASS="${AUTH_PASSWORD:-change_me_admin_password}"
SUFFIX="$(date +%s)"
STAFF_PASS='Un1t-Keys!Regression'
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

# The API throttles 10 requests / 60 s per handler per IP and this suite spends
# several on POST /v1/org-units. Wait the window out rather than loosening a
# production setting to suit a test.
THROTTLE_WAIT="${THROTTLE_WAIT:-62}"

as() {
  local tok="$1" body
  body=$(curl -s -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"})
  case "$body" in
    *ThrottlerException*)
      printf '\033[2m  (rate-limit window hit — waiting %ss)\033[0m\n' "$THROTTLE_WAIT" >&2
      sleep "$THROTTLE_WAIT"
      curl -s -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"}
      ;;
    *) printf '%s' "$body" ;;
  esac
}

as_code() {
  local tok="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$BASE$3" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${4:+-d "$4"})
  if [ "$code" = "429" ]; then
    printf '\033[2m  (rate-limit window hit — waiting %ss)\033[0m\n' "$THROTTLE_WAIT" >&2
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
api_code() { as_code "$ADMIN" "$@"; }

head2 "Setup"
ADMIN=$(login "$ADMIN_USER" "$ADMIN_PASS")
[ -n "$ADMIN" ] && ok "authenticated" || { red "cannot authenticate against $BASE"; exit 1; }

ENTITY_ID=$(jq_get "$(api POST /v1/entities \
  "{\"name\":\"UnitKey Co $SUFFIX\",\"country\":\"LS\",\"entityType\":\"ORGANISATION\"}")" id)
[ -n "$ENTITY_ID" ] && ok "organisation entity created" || { red "entity creation failed"; exit 1; }

ROOT_ID=$(jq_get "$(api POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"ORGANISATION\",\"name\":\"UnitKey Co\"}")" id)
DIV_ID=$(jq_get "$(api POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DIVISION\",\"name\":\"Corporate\",\"parentId\":\"$ROOT_ID\"}")" id)
FIN_ID=$(jq_get "$(api POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Finance\",\"code\":\"FIN\",\"parentId\":\"$DIV_ID\"}")" id)
HR_ID=$(jq_get "$(api POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"People\",\"code\":\"HR\",\"parentId\":\"$DIV_ID\"}")" id)
DEAD_ID=$(jq_get "$(api POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Dissolved\",\"code\":\"OLD\",\"parentId\":\"$DIV_ID\"}")" id)

if [ -n "$ROOT_ID" ] && [ -n "$DIV_ID" ] && [ -n "$FIN_ID" ] && [ -n "$HR_ID" ] && [ -n "$DEAD_ID" ]; then
  ok "chart built: UnitKey Co > Corporate > {Finance, People, Dissolved}"
else
  red "chart construction failed"; exit 1
fi

# ── A unit has no standing of its own ────────────────────────────────────────
head2 "A unit inherits its standing from the organisation"

assert_eq "a department of an unapproved organisation is refused a key" "422" \
  "$(api_code POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$FIN_ID\"}")"

REFUSAL=$(api POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$FIN_ID\"}")
assert_contains "the refusal names the organisation that must be approved" "inherits its standing from" "$REFUSAL"

# Drive the organisation to APPROVED through the real KYB workflow.
api POST "/v1/entities/$ENTITY_ID/org-profile" \
  "{\"legalName\":\"UnitKey Co (Pty) Ltd\",\"registrationNumber\":\"LS/$SUFFIX\",\"registrationCountry\":\"LS\",\"businessType\":\"PRIVATE_LIMITED\",\"regAddressLine1\":\"7 Griffith Rd\",\"regCity\":\"Maseru\",\"regCountry\":\"LS\"}" >/dev/null

CASE_ID=$(jq_get "$(api POST /v1/verification-cases "{\"entityId\":\"$ENTITY_ID\",\"caseType\":\"KYB\"}")" id)
printf 'Company registration certificate (test fixture)\n' > "$WORK/company.txt"
curl -s -X POST "$BASE/v1/verification-cases/$CASE_ID/evidence" \
  -H "Authorization: Bearer $ADMIN" \
  -F "file=@$WORK/company.txt;type=text/plain" \
  -F "documentType=COMPANY_CERTIFICATE" >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/submit" >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/assign" '{}' >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/review" '{"reviewNotes":"Verified for the unit-key regression."}' >/dev/null
api PATCH "/v1/verification-cases/$CASE_ID/approve" >/dev/null

assert_eq "organisation reaches APPROVED" "APPROVED" "$(jq_get "$(api GET "/v1/entities/$ENTITY_ID")" status)"

# ── Issuing the department key ───────────────────────────────────────────────
head2 "The department holds its own key"

CERT=$(api POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$FIN_ID\"}")
SERIAL=$(jq_get "$CERT" serial)
[ -n "$SERIAL" ] && ok "Finance issued a certificate ($SERIAL)" || { bad "Finance issued a certificate" "$CERT"; exit 1; }

assert_eq "the key is generated in and custodied by the HSM" "true" "$(jq_get "$CERT" hsmManaged)"
assert_contains "the PKCS#11 label marks it as a unit key" "unit-" "$(jq_get "$CERT" hsmKeyLabel)"
# openssl prints the DN with spaces around '=' — match its format, not ours.
assert_contains "the subject carries the unit as an OU" "OU = Finance" "$(jq_get "$CERT" subject)"
assert_contains "the subject names the organisation" "UnitKey Co" "$(jq_get "$CERT" subject)"
assert_eq "the holder is reported as the unit" "Finance" "$(jq_get "$CERT" unitName)"

LISTED=$(api GET "/v1/certificates?orgUnitId=$FIN_ID")
assert_contains "the certificate list filters by unit" "$SERIAL" "$LISTED"
assert_contains "the listed certificate names its unit" "Finance" "$LISTED"
assert_eq "the certificate is NOT attributed to a legal entity" "" "$(jq_get "$LISTED" 0.entityId)"

assert_eq "a certificate held by a unit does not appear under the entity" "" \
  "$(jq_get "$(api GET "/v1/certificates?entityId=$ENTITY_ID")" 0.serial)"

# ── The certificate is real ──────────────────────────────────────────────────
head2 "The certificate is a real, verifiable credential"

api GET "/v1/certificates/$SERIAL" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('certPem',''), end='')" > "$WORK/unit.pem"
curl -s "$BASE/v1/ca/chain" -o "$WORK/chain.pem"

if openssl verify -CAfile "$WORK/chain.pem" -no_check_time "$WORK/unit.pem" >/dev/null 2>&1; then
  ok "the department certificate chains to the intermediate CA"
else
  bad "the department certificate chains to the intermediate CA"
fi

ISSUER=$(openssl x509 -in "$WORK/unit.pem" -noout -issuer 2>/dev/null)
assert_contains "it was signed by the ETL intermediate, not self-signed" "Intermediate CA" "$ISSUER"

assert_eq "public status reports GOOD" "GOOD" \
  "$(jq_get "$(curl -s "$BASE/v1/certificates/$SERIAL/status")" status)"

# ── A dissolved unit cannot be given a key ───────────────────────────────────
head2 "A dissolved unit cannot start stamping again"

api PATCH "/v1/org-units/$DEAD_ID/deactivate" '{}' >/dev/null
assert_eq "a deactivated unit is refused a key" "422" \
  "$(api_code POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$DEAD_ID\"}")"

assert_eq "a unit that does not exist is a 404, not a 500" "404" \
  "$(api_code POST /v1/cert-requests/org-unit '{"orgUnitId":"00000000-0000-0000-0000-000000000000"}')"

# ── Scoped issuance follows the same chart rule ──────────────────────────────
head2 "Scoped cert:issue walks the org chart"

ADMIN_ROLE_ID=$(api GET /v1/roles | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    if r.get('name') == 'System Administrator': print(r['id']); break
")

make_staff() {
  local uname="wp31-$1-$SUFFIX" uid
  uid=$(jq_get "$(api POST /v1/users \
    "{\"username\":\"$uname\",\"email\":\"$uname@example.test\",\"displayName\":\"$1\",\"password\":\"$STAFF_PASS\"}")" id)
  [ -n "$uid" ] || { red "  cannot create user $uname"; exit 1; }
  api POST "/v1/users/$uid/roles" \
    "{\"roleId\":\"$ADMIN_ROLE_ID\",\"scope\":\"$2\",\"scopeId\":\"$3\"}" >/dev/null
  login "$uname" "$STAFF_PASS"
}

DIVOP=$(make_staff division ORG_UNIT "$DIV_ID")
FINOP=$(make_staff finance ORG_UNIT "$FIN_ID")

[ -n "$DIVOP" ] && ok "a Corporate-division operator can log in" || bad "division operator setup"

assert_eq "a division-scoped operator may issue for a department beneath it" "201" \
  "$(as_code "$DIVOP" POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$HR_ID\"}")"

assert_eq "a Finance-scoped operator may issue for Finance" "201" \
  "$(as_code "$FINOP" POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$FIN_ID\"}")"

assert_eq "a Finance-scoped operator may NOT issue for the sibling department" "403" \
  "$(as_code "$FINOP" POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$HR_ID\"}")"

assert_eq "a Finance-scoped operator may NOT issue for the division above it" "403" \
  "$(as_code "$FINOP" POST /v1/cert-requests/org-unit "{\"orgUnitId\":\"$DIV_ID\"}")"

printf '\n\033[1m── Result ──\033[0m\n'
green "  passed: $PASS"
[ "$FAIL" -gt 0 ] && red "  failed: $FAIL"
printf '\n'
[ "$FAIL" -eq 0 ]
