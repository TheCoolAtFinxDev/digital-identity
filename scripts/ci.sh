#!/usr/bin/env bash
#
# Continuous integration for the digital identity platform.
#
#   1. typecheck the API
#   2. run the unit tests
#   3. build the images
#   4. bring up an isolated stack (see docker-compose.ci.yml)
#   5. run both end-to-end suites against it
#   6. tear it down, keeping nothing behind
#
# The stack is namespaced and port-shifted, so this is safe to run on a machine
# where the developer stack is already up. Runs identically on a CI runner and
# on a workstation — .github/workflows/ci.yml is a thin wrapper around it.
#
# Usage: bash scripts/ci.sh
#
# Requirements: bash, curl, podman + podman-compose (or set COMPOSE=...), node.

set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMPOSE="${COMPOSE:-podman-compose}"
PROJECT="${CI_PROJECT:-di-ci}"
PORT="${CI_API_PORT:-18080}"
export CI_API_PORT="$PORT"
export CI_ADMIN_USER="${CI_ADMIN_USER:-admin}"
export CI_ADMIN_PASSWORD="${CI_ADMIN_PASSWORD:-ci_admin_password_not_for_deployment}"

BASE="http://localhost:$PORT"
FILES=(-f docker-compose.ci.yml)
LOGDIR=".ci/logs"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
stage() { printf "\n${YLW}══ %s${NC}\n" "$1"; }
die()   { printf "${RED}CI FAILED: %s${NC}\n" "$1"; exit 1; }

teardown() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -d "$LOGDIR" ]; then
    printf "\n${RED}── certsvc log tail ──${NC}\n"
    $COMPOSE "${FILES[@]}" -p "$PROJECT" logs --tail 60 certsvc 2>/dev/null || true
  fi
  stage "Tearing down the CI stack"
  $COMPOSE "${FILES[@]}" -p "$PROJECT" down -v >/dev/null 2>&1 || true
  rm -rf .ci
  exit "$code"
}
trap teardown EXIT

# ── 1. Typecheck ─────────────────────────────────────────────────────────────
stage "Typechecking the API"
( cd api && [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null ) || die "npm ci failed"
( cd api && npx prisma generate >/dev/null 2>&1 && ./node_modules/.bin/tsc -p tsconfig.json --noEmit ) \
  || die "typecheck failed"
printf "${GRN}  typecheck clean${NC}\n"

# ── 2. Unit tests ────────────────────────────────────────────────────────────
stage "Unit tests"
( cd api && npx jest --ci ) || die "unit tests failed"

# ── 3. Seed a throwaway PKI directory ────────────────────────────────────────
# ca-bootstrap needs the CA config; everything it generates stays under .ci and
# is destroyed on teardown, so a CI run never touches the developer's CA state.
stage "Preparing the isolated CI workspace"
rm -rf .ci
mkdir -p .ci/pki .ci/storage/evidence .ci/storage/stamps "$LOGDIR"
cp pki/openssl.cnf pki/init-ca.sh pki/hsm-engine.cnf .ci/pki/ || die "PKI config missing"

# ── 4. Build and start ───────────────────────────────────────────────────────
stage "Building images"
$COMPOSE "${FILES[@]}" -p "$PROJECT" build softhsm certsvc > "$LOGDIR/build.log" 2>&1 \
  || { tail -30 "$LOGDIR/build.log"; die "image build failed"; }
printf "${GRN}  images built${NC}\n"

stage "Starting the CI stack on :$PORT"
$COMPOSE "${FILES[@]}" -p "$PROJECT" up -d certsvc > "$LOGDIR/up.log" 2>&1 \
  || { tail -30 "$LOGDIR/up.log"; die "stack failed to start"; }

printf "  waiting for /health"
for i in $(seq 1 60); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    printf "\n${GRN}  API healthy after ${i}s${NC}\n"
    break
  fi
  [ "$i" -eq 60 ] && { printf "\n"; die "API did not become healthy within 60s"; }
  printf "."
  sleep 1
done

# ── 5. End-to-end suites ─────────────────────────────────────────────────────
export AUTH_USERNAME="$CI_ADMIN_USER"
export AUTH_PASSWORD="$CI_ADMIN_PASSWORD"
FAILED=""

stage "Phase 1-B lifecycle suite"
if bash scripts/e2e-phase-1b.sh "$BASE" 2>&1 | tee "$LOGDIR/e2e-phase-1b.log" | tail -25; then
  printf "${GRN}  phase 1-B suite passed${NC}\n"
else
  FAILED="$FAILED phase-1b"
fi

stage "Org structure suite"
if bash scripts/e2e-org-structure.sh "$BASE" 2>&1 | tee "$LOGDIR/e2e-org-structure.log" | tail -20; then
  printf "${GRN}  org structure suite passed${NC}\n"
else
  FAILED="$FAILED org-structure"
fi

stage "Feature suite (F1-F6)"
if bash scripts/e2e-features.sh "$BASE" 2>&1 | tee "$LOGDIR/e2e-features.log" | tail -25; then
  printf "${GRN}  feature suite passed${NC}\n"
else
  FAILED="$FAILED features"
fi

# ── 6. Verdict ───────────────────────────────────────────────────────────────
if [ -n "$FAILED" ]; then
  die "suite(s) failed:$FAILED"
fi

stage "CI PASSED"
printf "${GRN}Both suites green against %s${NC}\n" "$BASE"
