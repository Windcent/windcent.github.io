#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUESTED_PORT="${1:-8080}"

PORT="$(python3 - "$REQUESTED_PORT" <<'PY'
import socket, sys
req = int(sys.argv[1])
for p in [req] + list(range(req + 1, req + 50)):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", p))
            print(p)
            sys.exit(0)
        except OSError:
            continue
sys.exit(1)
PY
)"

URL="http://127.0.0.1:${PORT}/main.html"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SCRIPT_DIR" >/dev/null 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait briefly for the server to start accepting connections
sleep 0.4

echo "Serving planning simulation at ${URL}"
echo "Press Ctrl+C to stop the server."

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
else
  echo "Could not auto-detect a browser launcher. Open ${URL} manually."
fi

wait "$SERVER_PID"
