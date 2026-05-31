#!/usr/bin/env bash
# ─── SoftHSM + pkcs11-proxy network HSM ──────────────────────────────────────
# 1. Idempotently initialise one PKCS#11 token (persisted on a volume).
# 2. Serve the SoftHSM module over TCP via pkcs11-daemon, so remote clients
#    (certsvc) can load libpkcs11-proxy.so and use the token across the network.
set -euo pipefail

TOKEN_LABEL="${HSM_TOKEN_LABEL:-econet-ca}"
SO_PIN="${HSM_SO_PIN:-change_me_so_pin}"
USER_PIN="${HSM_USER_PIN:-change_me_user_pin}"
MODULE="${PKCS11_MODULE:-/usr/lib/softhsm/libsofthsm2.so}"
# Where the daemon listens. Override with PKCS11_DAEMON_SOCKET.
export PKCS11_DAEMON_SOCKET="${PKCS11_DAEMON_SOCKET:-tcp://0.0.0.0:5657}"

echo "SoftHSM config : ${SOFTHSM2_CONF}"
echo "Module served  : ${MODULE}"
echo "Daemon socket  : ${PKCS11_DAEMON_SOCKET}"

# ── 1. Token bootstrap (only if absent) ──────────────────────────────────────
if softhsm2-util --show-slots 2>/dev/null | grep -q "Label:[[:space:]]*${TOKEN_LABEL}"; then
  echo "Token '${TOKEN_LABEL}' already initialised — skipping init."
else
  echo "Initialising token '${TOKEN_LABEL}'..."
  softhsm2-util --init-token --free \
    --label "${TOKEN_LABEL}" --so-pin "${SO_PIN}" --pin "${USER_PIN}"
  echo "Token '${TOKEN_LABEL}' initialised."
fi
softhsm2-util --show-slots | grep -E "Label:|Serial number:" || true

# ── 2. Optional TLS-PSK (recommended for prod) ───────────────────────────────
# If PKCS11_PROXY_TLS_PSK_FILE points at a PSK file, the daemon encrypts +
# authenticates the channel. Left unset for dev (plaintext on the internal
# podman network only — do NOT publish 5657 to untrusted networks without PSK).
if [ -n "${PKCS11_PROXY_TLS_PSK_FILE:-}" ]; then
  echo "TLS-PSK enabled via ${PKCS11_PROXY_TLS_PSK_FILE}"
else
  echo "WARNING: pkcs11-daemon running WITHOUT TLS-PSK (dev mode, internal network only)."
fi

echo "──────────────────────────────────────────────"
echo "Starting pkcs11-daemon..."
exec pkcs11-daemon "${MODULE}"
