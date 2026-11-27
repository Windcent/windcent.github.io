#!/usr/bin/env bash
set -euo pipefail

# Always serve from the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="127.0.0.1"
PORT="${1:-8000}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to run the local SlideMAKER server." >&2
  exit 1
fi

# Find an available port starting from PORT
PORT="$(python3 - "$HOST" "$PORT" <<'PY'
import socket, sys
host = sys.argv[1]
port = int(sys.argv[2])
for p in range(port, port + 50):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex((host, p)) != 0:
            print(p)
            sys.exit(0)
print(port)
PY
)"

URL="http://${HOST}:${PORT}"

echo "=========================================="
echo "  SlideMAKER Local Server"
echo "  URL: ${URL}"
echo "  Press Ctrl+C to stop"
echo "=========================================="

# Open default browser in the background after the server starts
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 0.6 && xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

exec python3 -m http.server "$PORT" --bind "$HOST"
