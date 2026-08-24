#!/usr/bin/env bash
#
# Sprint 2 regression: the organisational chart and approval routing.
#
#   organisation -> division -> department, people placed on it, and the
#   manager/HOD pair that a department stamp request will have to satisfy.
#
# Usage: bash scripts/e2e-org-structure.sh [baseUrl]
# Requirements: bash, curl, python3.

set -uo pipefail

BASE="${1:-http://localhost:8080}"
ADMIN_USER="${AUTH_USERNAME:-admin}"
ADMIN_PASS="${AUTH_PASSWORD:-change_me_admin_password}"
SUFFIX="$(date +%s)"
PASS=0
FAIL=0

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
head2() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok()    { PASS=$((PASS + 1)); green "  PASS  $1"; }
bad()   { FAIL=$((FAIL + 1)); red   "  FAIL  $1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; }

assert_eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi; }
assert_contains() { case "$3" in *"$2"*) ok "$1" ;; *) bad "$1" "'$2' not in: $(printf '%s' "$3" | head -c 160)" ;; esac; }

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

# The API throttles 10 requests / 60 s per route-handler per IP. A single run of
# this suite spends 7 of that budget on POST /v1/org-units (four creates and
# three shape-rule negatives), so running it twice inside a minute trips the
# limit and reports false failures. Rather than loosen a production setting to
# suit a test, wait out the window once and retry.
THROTTLE_WAIT="${THROTTLE_WAIT:-62}"

_curl() {
  local body
  body=$(curl -s -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${3:+-d "$3"})
  case "$body" in
    *ThrottlerException*)
      printf '\033[2m  (rate-limit window hit — waiting %ss)\033[0m\n' "$THROTTLE_WAIT" >&2
      sleep "$THROTTLE_WAIT"
      curl -s -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${3:+-d "$3"}
      ;;
    *) printf '%s' "$body" ;;
  esac
}

api() { _curl "$@"; }

api_code() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${3:+-d "$3"})
  if [ "$code" = "429" ]; then
    printf '\033[2m  (rate-limit window hit — waiting %ss)\033[0m\n' "$THROTTLE_WAIT" >&2
    sleep "$THROTTLE_WAIT"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${3:+-d "$3"})
  fi
  printf '%s' "$code"
}

head2 "Setup"
TOKEN=$(curl -s -X POST "$BASE/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')
[ -n "$TOKEN" ] && ok "authenticated" || { red "cannot authenticate against $BASE"; exit 1; }

ENTITY=$(api POST /v1/entities "{\"name\":\"OrgChart Co $SUFFIX\",\"country\":\"LS\",\"entityType\":\"ORGANISATION\"}")
ENTITY_ID=$(jq_get "$ENTITY" id)
[ -n "$ENTITY_ID" ] && ok "organisation entity created" || { bad "entity created" "$ENTITY"; exit 1; }

# ── Structure ────────────────────────────────────────────────────────────────
head2 "Structure: organisation -> division -> department"

ROOT=$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"ORGANISATION\",\"name\":\"OrgChart Co\"}")
ROOT_ID=$(jq_get "$ROOT" id)
[ -n "$ROOT_ID" ] && ok "root unit created" || bad "root unit created" "$ROOT"

DIV=$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DIVISION\",\"name\":\"Technology\",\"parentId\":\"$ROOT_ID\"}")
DIV_ID=$(jq_get "$DIV" id)
[ -n "$DIV_ID" ] && ok "division created under the root" || bad "division created" "$DIV"

DEPT=$(api POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Finance\",\"code\":\"FIN\",\"parentId\":\"$DIV_ID\"}")
DEPT_ID=$(jq_get "$DEPT" id)
[ -n "$DEPT_ID" ] && ok "department created under the division" || bad "department created" "$DEPT"

assert_eq "a fresh unit reports its head seat vacant" "true" "$(jq_get "$DEPT" headVacant)"

TREE=$(api GET "/v1/org-units?entityId=$ENTITY_ID&tree=true")
assert_contains "tree view nests the department under the division" "Finance" "$TREE"

DETAIL=$(api GET "/v1/org-units/$DEPT_ID")
assert_contains "department reports its ancestry up to the root" "Technology" "$(jq_get "$DETAIL" ancestry)"

# ── Shape rules ──────────────────────────────────────────────────────────────
head2 "Shape rules"

assert_eq "a second root is refused" "409" \
  "$(api_code POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"ORGANISATION\",\"name\":\"Rival Root\"}")"

assert_eq "a division cannot sit under a department" "400" \
  "$(api_code POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DIVISION\",\"name\":\"Upside Down\",\"parentId\":\"$DEPT_ID\"}")"

assert_eq "a department cannot be created without a parent" "400" \
  "$(api_code POST /v1/org-units "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Orphan\"}")"

assert_eq "a unit cannot be moved under its own descendant" "400" \
  "$(api_code PATCH "/v1/org-units/$DIV_ID" "{\"parentId\":\"$DEPT_ID\"}")"

# ── People ───────────────────────────────────────────────────────────────────
head2 "People on the chart"

STAFF_ID=$(api POST /v1/users "{\"username\":\"staff_$SUFFIX\",\"email\":\"staff_$SUFFIX@orgchart.ls\",\"password\":\"OrgPass!$SUFFIX\",\"displayName\":\"Staff Member\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
MGR_ID=$(api POST /v1/users "{\"username\":\"mgr_$SUFFIX\",\"email\":\"mgr_$SUFFIX@orgchart.ls\",\"password\":\"OrgPass!$SUFFIX\",\"displayName\":\"Line Manager\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
HOD_ID=$(api POST /v1/users "{\"username\":\"hod_$SUFFIX\",\"email\":\"hod_$SUFFIX@orgchart.ls\",\"password\":\"OrgPass!$SUFFIX\",\"displayName\":\"Head of Finance\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
[ -n "$STAFF_ID" ] && [ -n "$MGR_ID" ] && [ -n "$HOD_ID" ] && ok "staff, manager and HOD created" || bad "users created"

api PATCH "/v1/users/$MGR_ID/placement"   "{\"orgUnitId\":\"$DEPT_ID\"}" > /dev/null
api PATCH "/v1/users/$HOD_ID/placement"   "{\"orgUnitId\":\"$DEPT_ID\"}" > /dev/null
PLACED=$(api PATCH "/v1/users/$STAFF_ID/placement" "{\"orgUnitId\":\"$DEPT_ID\",\"managerId\":\"$MGR_ID\"}")
assert_eq "staff placed in the department" "$DEPT_ID" "$(jq_get "$PLACED" orgUnitId)"
assert_eq "staff reports to the manager"   "$MGR_ID"  "$(jq_get "$PLACED" managerId)"

assert_eq "nobody can be their own manager" "400" \
  "$(api_code PATCH "/v1/users/$STAFF_ID/placement" "{\"managerId\":\"$STAFF_ID\"}")"

assert_eq "a reporting loop is refused" "400" \
  "$(api_code PATCH "/v1/users/$MGR_ID/placement" "{\"managerId\":\"$STAFF_ID\"}")"

# ── Approval routing ─────────────────────────────────────────────────────────
head2 "Approval routing"

CHAIN=$(api GET "/v1/users/$STAFF_ID/approval-chain")
assert_eq "no head appointed yet, so a stamp cannot be requested" "false" "$(jq_get "$CHAIN" canRequestStamp)"
assert_contains "the blocker names the vacant head seat" "no active head" "$(jq_get "$CHAIN" blockers)"

api PATCH "/v1/org-units/$DEPT_ID/head" "{\"headUserId\":\"$HOD_ID\"}" > /dev/null
CHAIN=$(api GET "/v1/users/$STAFF_ID/approval-chain")
assert_eq "with a head appointed, the chain is complete" "true"     "$(jq_get "$CHAIN" canRequestStamp)"
assert_eq "the reviewer is the line manager"              "$MGR_ID"  "$(jq_get "$CHAIN" reviewer.id)"
assert_eq "the approver is the head of department"        "$HOD_ID"  "$(jq_get "$CHAIN" approver.id)"

# The HOD cannot approve their own request — four eyes has to break somewhere.
HOD_CHAIN=$(api GET "/v1/users/$HOD_ID/approval-chain")
assert_eq "the HOD cannot approve their own request" "false" "$(jq_get "$HOD_CHAIN" canRequestStamp)"

# Deactivation, not deletion, is how a seat really falls vacant.
api PATCH "/v1/users/$HOD_ID/deactivate" > /dev/null
CHAIN=$(api GET "/v1/users/$STAFF_ID/approval-chain")
assert_eq "a deactivated head leaves the seat vacant" "false" "$(jq_get "$CHAIN" canRequestStamp)"

DEPT_AFTER=$(api GET "/v1/org-units/$DEPT_ID")
assert_eq "the unit reports the vacancy" "true" "$(jq_get "$DEPT_AFTER" headVacant)"

# ── Lifecycle ────────────────────────────────────────────────────────────────
head2 "Unit lifecycle"

assert_eq "a unit holding people cannot be deactivated" "422" \
  "$(api_code PATCH "/v1/org-units/$DEPT_ID/deactivate")"

assert_eq "a unit with live sub-units cannot be deactivated" "422" \
  "$(api_code PATCH "/v1/org-units/$DIV_ID/deactivate")"

printf '\n'
if [ "$FAIL" -eq 0 ]; then green "All $PASS assertions passed."; exit 0
else red "$FAIL of $((PASS + FAIL)) assertions failed."; exit 1; fi
