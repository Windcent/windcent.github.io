#!/usr/bin/env bash
# ==============================================================================
# HHB_Builder - Hot Air Balloon Envelope Terminal Launcher
# Starts local HTTP server, detects available port, and opens in default browser.
# ==============================================================================

set -e

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Amber Terminal Color Palette (ANSI 256 colors)
AMBER="\033[38;5;214m"
AMBER_BRIGHT="\033[38;5;220m"
AMBER_DIM="\033[38;5;130m"
RESET="\033[0m"
BOLD="\033[1m"

# Display ASCII Banner
echo -e "${AMBER_BRIGHT}"
cat << "EOF"
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║   _   _ _   _ ____    ____        _ _     _                           ║
  ║  | | | | | | | __ )  | __ ) _   _(_) | __| | ___ _ __                 ║
  ║  | |_| | |_| |  _ \  |  _ \| | | | | |/ _` |/ _ \ '__|                ║
  ║  |  _  |  _  | |_) | | |_) | |_| | | | (_| |  __/ |                   ║
  ║  |_| |_|_| |_|____/  |____/ \__,_|_|_|\__,_|\___|_|  v2.4             ║
  ║                                                                       ║
  ║   HOT AIR BALLOON ENVELOPE PLANNER // AMBER PHOSPHOR TERMINAL         ║
  ╚═══════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${RESET}"

# Find free port starting at 8080 (or custom port passed as $1)
REQUESTED_PORT="${1:-8080}"
PORT=$(python3 -c "
import socket
start_port = int('$REQUESTED_PORT')
for p in range(start_port, start_port + 100):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', p))
            print(p)
            exit(0)
        except OSError:
            continue
print(start_port)
")

URL="http://127.0.0.1:${PORT}/"

echo -e "${AMBER_DIM}[SYSTEM INIT]${RESET} Workspace root: ${AMBER}${SCRIPT_DIR}${RESET}"
echo -e "${AMBER_DIM}[SYSTEM INIT]${RESET} Selected network port: ${AMBER_BRIGHT}${PORT}${RESET}"
echo -e "${AMBER_DIM}[SYSTEM INIT]${RESET} Local URL: ${BOLD}${AMBER_BRIGHT}${URL}${RESET}"

# Start Python HTTP server in the background
python3 -m http.server "${PORT}" --directory "${SCRIPT_DIR}" > /dev/null 2>&1 &
SERVER_PID=$!

# Trap signals for graceful shutdown on Ctrl+C or kill
cleanup() {
    echo ""
    echo -e "${AMBER_DIM}[TERMINAL]${RESET} Shutting down server (PID: ${SERVER_PID})..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo -e "${AMBER}[SYSTEM TERMINATED]${RESET} Goodbye."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Wait briefly for server socket readiness
python3 -c "
import urllib.request, time
url = '${URL}'
for _ in range(30):
    try:
        with urllib.request.urlopen(url, timeout=0.5) as r:
            if r.status == 200:
                break
    except Exception:
        time.sleep(0.1)
"

echo -e "${AMBER}[SERVER ONLINE]${RESET} HTTP daemon running on PID ${SERVER_PID}."

# Open in browser if graphical environment is available
echo -e "${AMBER_DIM}[BROWSER]${RESET} Opening interface..."

OPENED=false
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        nohup xdg-open "$URL" >/dev/null 2>&1 &
        OPENED=true
    elif command -v sensible-browser >/dev/null 2>&1; then
        nohup sensible-browser "$URL" >/dev/null 2>&1 &
        OPENED=true
    elif command -v gio >/dev/null 2>&1; then
        nohup gio open "$URL" >/dev/null 2>&1 &
        OPENED=true
    fi
fi

# Fallback: python's webbrowser module
if [ "$OPENED" = false ] && ([ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]); then
    nohup python3 -m webbrowser "$URL" >/dev/null 2>&1 &
    OPENED=true
fi

if [ "$OPENED" = true ]; then
    echo -e "${AMBER_BRIGHT}[BROWSER LAUNCHED]${RESET} Web browser opened to ${URL}"
else
    echo -e "${AMBER}[NOTICE]${RESET} GUI browser could not be launched automatically (no active display)."
    echo -e "${AMBER}[ACTION]${RESET} Open your browser and navigate to: ${BOLD}${AMBER_BRIGHT}${URL}${RESET}"
fi

echo ""
echo -e "${AMBER_DIM}Press ${BOLD}Ctrl+C${RESET}${AMBER_DIM} at any time to halt the server.${RESET}"
echo ""

# Keep running in foreground
wait "$SERVER_PID"
