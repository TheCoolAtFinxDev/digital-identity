#!/usr/bin/env bash
#
# WP-2.4 regression: a role granted over an organisational unit means something.
#
# Before this, PermissionGuard resolved every @RequirePermission at GLOBAL scope,
# so a role assignment narrowed to a department granted nothing at all and the
# only way to let someone act was to make them organisation-wide. This suite
# pins the four properties that replaced that:
#
#   1. a grant on a unit authorises acting on that unit
#   2. authority flows DOWN the chart — a division grant covers its departments
#   3. authority never flows UP or SIDEWAYS — no parent, no siblings
#   4. some permissions stay organisation-wide on purpose, and a scoped holder
#      cannot use them to widen their own authority
#
# Usage: bash scripts/e2e-scoped-authority.sh [baseUrl]
# Requirements: bash, curl, python3.

set -uo pipefail

BASE="${1:-http://localhost:8080}"
ADMIN_USER="${AUTH_USERNAME:-admin}"
ADMIN_PASS="${AUTH_PASSWORD:-change_me_admin_password}"
SUFFIX="$(date +%s)"
STAFF_PASS='Sc0ped-Authority!1'
PASS=0
FAIL=0

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
head2() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok()    { PASS=$((PASS + 1)); green "  PASS  $1"; }
bad()   { FAIL=$((FAIL + 1)); red   "  FAIL  $1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; }

assert_eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi; }

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

# Same throttle accommodation as the org-structure suite: the API allows 10
# requests / 60 s per handler per IP, and this run spends several of them on
# POST /v1/org-units. Wait the window out rather than loosening a production
# setting to suit a test.
THROTTLE_WAIT="${THROTTLE_WAIT:-62}"

# as <token> <METHOD> <path> [body] -> response body
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

# as_code <token> <METHOD> <path> [body] -> HTTP status
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

# make_staff <username-suffix> <scope> <scopeId> -> token for a user holding the
# System Administrator role ONLY at that scope. No global grant anywhere.
make_staff() {
  local uname="wp24-$1-$SUFFIX" u uid
  u=$(as "$ADMIN" POST /v1/users \
    "{\"username\":\"$uname\",\"email\":\"$uname@example.test\",\"displayName\":\"$1\",\"password\":\"$STAFF_PASS\"}")
  uid=$(jq_get "$u" id)
  if [ -z "$uid" ]; then red "  cannot create user $uname: $u"; exit 1; fi
  as "$ADMIN" POST "/v1/users/$uid/roles" \
    "{\"roleId\":\"$ADMIN_ROLE_ID\",\"scope\":\"$2\",\"scopeId\":\"$3\"}" >/dev/null
  printf '%s|%s' "$uid" "$(login "$uname" "$STAFF_PASS")"
}

head2 "Setup"
ADMIN=$(login "$ADMIN_USER" "$ADMIN_PASS")
[ -n "$ADMIN" ] && ok "authenticated as the global administrator" || { red "cannot authenticate against $BASE"; exit 1; }

ADMIN_ROLE_ID=$(as "$ADMIN" GET /v1/roles | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    if r.get('name') == 'System Administrator': print(r['id']); break
")
[ -n "$ADMIN_ROLE_ID" ] && ok "found the System Administrator role" || { red "role lookup failed"; exit 1; }

ENTITY_ID=$(jq_get "$(as "$ADMIN" POST /v1/entities \
  "{\"name\":\"Scope Co $SUFFIX\",\"country\":\"LS\",\"entityType\":\"ORGANISATION\"}")" id)
[ -n "$ENTITY_ID" ] && ok "organisation entity created" || { red "entity creation failed"; exit 1; }

ROOT_ID=$(jq_get "$(as "$ADMIN" POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"ORGANISATION\",\"name\":\"Scope Co\"}")" id)
DIV_ID=$(jq_get "$(as "$ADMIN" POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DIVISION\",\"name\":\"Technology\",\"parentId\":\"$ROOT_ID\"}")" id)
FIN_ID=$(jq_get "$(as "$ADMIN" POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"Finance\",\"code\":\"FIN\",\"parentId\":\"$DIV_ID\"}")" id)
HR_ID=$(jq_get "$(as "$ADMIN" POST /v1/org-units \
  "{\"entityId\":\"$ENTITY_ID\",\"unitType\":\"DEPARTMENT\",\"name\":\"People\",\"code\":\"HR\",\"parentId\":\"$DIV_ID\"}")" id)

if [ -n "$ROOT_ID" ] && [ -n "$DIV_ID" ] && [ -n "$FIN_ID" ] && [ -n "$HR_ID" ]; then
  ok "chart built: Scope Co > Technology > {Finance, People}"
else
  red "chart construction failed"; exit 1
fi

IFS='|' read -r FINHEAD_ID FINHEAD <<EOF
$(make_staff finance ORG_UNIT "$FIN_ID")
EOF
[ -n "$FINHEAD" ] && ok "a Finance-scoped operator exists and can log in" || { red "Finance operator setup failed"; exit 1; }

IFS='|' read -r DIVHEAD_ID DIVHEAD <<EOF
$(make_staff division ORG_UNIT "$DIV_ID")
EOF
[ -n "$DIVHEAD" ] && ok "a Technology-scoped operator exists and can log in" || { red "division operator setup failed"; exit 1; }

# ── 1. A scoped grant authorises its own unit ────────────────────────────────
head2 "A grant on a unit authorises that unit"

assert_eq "Finance operator may rename the Finance department" "200" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$FIN_ID" '{"code":"FIN2"}')"

assert_eq "Finance operator may appoint the Finance head" "200" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$FIN_ID/head" "{\"headUserId\":\"$FINHEAD_ID\"}")"

# ── 2. Authority flows down ──────────────────────────────────────────────────
head2 "Authority flows down the chart"

assert_eq "Technology operator may appoint the head of Finance beneath it" "200" \
  "$(as_code "$DIVHEAD" PATCH "/v1/org-units/$FIN_ID/head" "{\"headUserId\":\"$FINHEAD_ID\"}")"

assert_eq "Technology operator may appoint the head of People beneath it" "200" \
  "$(as_code "$DIVHEAD" PATCH "/v1/org-units/$HR_ID/head" "{\"headUserId\":\"$DIVHEAD_ID\"}")"

# ── 3. Authority never flows up or sideways ─────────────────────────────────
head2 "Authority never flows up or sideways"

assert_eq "Finance operator may NOT touch the sibling People department" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$HR_ID/head" "{\"headUserId\":\"$FINHEAD_ID\"}")"

assert_eq "Finance operator may NOT touch the division above it" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$DIV_ID/head" "{\"headUserId\":\"$FINHEAD_ID\"}")"

assert_eq "Finance operator may NOT touch the organisation root" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$ROOT_ID/head" "{\"headUserId\":\"$FINHEAD_ID\"}")"

assert_eq "Finance operator may NOT deactivate the sibling department" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$HR_ID/deactivate" '{}')"

assert_eq "a unit that does not exist is refused, not waved through" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/00000000-0000-0000-0000-000000000000/head" '{}')"

# ── 4. Some authority stays organisation-wide ───────────────────────────────
head2 "Organisation-wide permissions cannot be reached from a scoped grant"

assert_eq "a scoped operator may NOT create users" "403" \
  "$(as_code "$FINHEAD" POST /v1/users \
    "{\"username\":\"sneak-$SUFFIX\",\"email\":\"sneak-$SUFFIX@example.test\",\"password\":\"$STAFF_PASS\"}")"

assert_eq "a scoped operator may NOT grant themselves a role" "403" \
  "$(as_code "$FINHEAD" POST "/v1/users/$FINHEAD_ID/roles" "{\"roleId\":\"$ADMIN_ROLE_ID\"}")"

assert_eq "a scoped operator may NOT mint a service account" "403" \
  "$(as_code "$FINHEAD" POST /v1/service-accounts "{\"name\":\"sneak-$SUFFIX\"}")"

assert_eq "a scoped operator may NOT move a unit between parents" "403" \
  "$(as_code "$FINHEAD" PATCH "/v1/org-units/$FIN_ID" "{\"parentId\":\"$ROOT_ID\"}")"

# ── 5. Nothing that worked before has stopped working ───────────────────────
head2 "The global administrator is unaffected"

assert_eq "admin may still appoint any head" "200" \
  "$(as_code "$ADMIN" PATCH "/v1/org-units/$HR_ID/head" "{\"headUserId\":\"$DIVHEAD_ID\"}")"

assert_eq "admin may still read the org chart" "200" \
  "$(as_code "$ADMIN" GET "/v1/org-units?entityId=$ENTITY_ID")"

assert_eq "admin may still create users" "201" \
  "$(as_code "$ADMIN" POST /v1/users \
    "{\"username\":\"wp24-after-$SUFFIX\",\"email\":\"wp24-after-$SUFFIX@example.test\",\"password\":\"$STAFF_PASS\"}")"

# ── 6. The refusals are on the record ───────────────────────────────────────
head2 "Refusals are audited"

DENIALS=$(as "$ADMIN" GET "/v1/audit-logs?event=PERMISSION_CHECK_FAILED&limit=50" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d if isinstance(d, list) else next((v for v in d.values() if isinstance(v, list)), [])
print(sum(1 for r in rows if isinstance(r, dict) and 'org-units' in str((r.get('detail') or {}).get('route', ''))))
")
if [ "${DENIALS:-0}" -gt 0 ]; then
  ok "denied org-unit calls are written to the audit log ($DENIALS found)"
else
  bad "denied org-unit calls are audited" "no PERMISSION_CHECK_FAILED rows mention org-units"
fi

printf '\n\033[1m── Result ──\033[0m\n'
green "  passed: $PASS"
[ "$FAIL" -gt 0 ] && red "  failed: $FAIL"
printf '\n'
[ "$FAIL" -eq 0 ]
