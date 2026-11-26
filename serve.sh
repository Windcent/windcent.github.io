#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://127.0.0.1:${PORT}/inverse-kinematics/"

echo "Serving ${ROOT_DIR} on http://127.0.0.1:${PORT}"
echo "  Profile : http://127.0.0.1:${PORT}/"
echo "  IK Lab  : ${URL}"
echo "Press Ctrl+C to stop."

(
    sleep 0.5
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${URL}" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "${URL}" >/dev/null 2>&1 || true
    elif command -v wslview >/dev/null 2>&1; then
        wslview "${URL}" >/dev/null 2>&1 || true
    fi
) &

cd "${ROOT_DIR}"
exec python3 -m http.server "${PORT}" --bind 127.0.0.1
