#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

medha() {
  node "$ROOT_DIR/medha.mjs" "$@"
}

usage() {
  cat <<'USAGE'
Usage: scripts/medha-gateway-service.sh <command>

Commands:
  install     Install launchd/system service, start it, show status
  start       Start the installed service
  stop        Stop the installed service
  restart     Restart the installed service
  status      Show service/gateway status
  uninstall   Uninstall the installed service
USAGE
}

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

case "$1" in
  install)
    medha gateway install --force
    medha gateway start
    medha gateway status
    ;;
  start)
    medha gateway start
    medha gateway status
    ;;
  stop)
    medha gateway stop
    medha gateway status
    ;;
  restart)
    medha gateway restart
    medha gateway status
    ;;
  status)
    medha gateway status
    ;;
  uninstall)
    medha gateway uninstall
    medha gateway status
    ;;
  *)
    usage
    exit 2
    ;;
esac
