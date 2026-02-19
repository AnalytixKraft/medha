#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${MEDHA_IMAGE:-${CLAWDBOT_IMAGE:-medha:local}}"
CONFIG_DIR="${MEDHA_CONFIG_DIR:-${CLAWDBOT_CONFIG_DIR:-$HOME/.medha}}"
WORKSPACE_DIR="${MEDHA_WORKSPACE_DIR:-${CLAWDBOT_WORKSPACE_DIR:-$HOME/.medha/workspace}}"
PROFILE_FILE="${MEDHA_PROFILE_FILE:-${CLAWDBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e MEDHA_LIVE_TEST=1 \
  -e MEDHA_LIVE_MODELS="${MEDHA_LIVE_MODELS:-${CLAWDBOT_LIVE_MODELS:-all}}" \
  -e MEDHA_LIVE_PROVIDERS="${MEDHA_LIVE_PROVIDERS:-${CLAWDBOT_LIVE_PROVIDERS:-}}" \
  -e MEDHA_LIVE_MODEL_TIMEOUT_MS="${MEDHA_LIVE_MODEL_TIMEOUT_MS:-${CLAWDBOT_LIVE_MODEL_TIMEOUT_MS:-}}" \
  -e MEDHA_LIVE_REQUIRE_PROFILE_KEYS="${MEDHA_LIVE_REQUIRE_PROFILE_KEYS:-${CLAWDBOT_LIVE_REQUIRE_PROFILE_KEYS:-}}" \
  -v "$CONFIG_DIR":/home/node/.medha \
  -v "$WORKSPACE_DIR":/home/node/.medha/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
