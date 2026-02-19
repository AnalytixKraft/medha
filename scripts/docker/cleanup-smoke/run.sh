#!/usr/bin/env bash
set -euo pipefail

cd /repo

export MEDHA_STATE_DIR="/tmp/medha-test"
export MEDHA_CONFIG_PATH="${MEDHA_STATE_DIR}/medha.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${MEDHA_STATE_DIR}/credentials"
mkdir -p "${MEDHA_STATE_DIR}/agents/main/sessions"
echo '{}' >"${MEDHA_CONFIG_PATH}"
echo 'creds' >"${MEDHA_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${MEDHA_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm medha reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${MEDHA_CONFIG_PATH}"
test ! -d "${MEDHA_STATE_DIR}/credentials"
test ! -d "${MEDHA_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${MEDHA_STATE_DIR}/credentials"
echo '{}' >"${MEDHA_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm medha uninstall --state --yes --non-interactive

test ! -d "${MEDHA_STATE_DIR}"

echo "OK"
