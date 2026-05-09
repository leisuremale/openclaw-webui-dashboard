#!/usr/bin/env bash
# OpenClaw Dashboard — one-shot installer
# Sets up backend venv, installs Python + Node deps, and builds the frontend.
#
# Usage:
#   ./install.sh              # full install + build
#   ./install.sh --no-build   # skip the frontend production build
#   ./install.sh --backend    # only backend
#   ./install.sh --frontend   # only frontend

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DO_BACKEND=1
DO_FRONTEND=1
DO_BUILD=1

for arg in "$@"; do
    case "$arg" in
        --backend) DO_FRONTEND=0 ;;
        --frontend) DO_BACKEND=0 ;;
        --no-build) DO_BUILD=0 ;;
        --help|-h)
            sed -n '2,12p' "$0"
            exit 0
            ;;
        *)
            echo "Unknown arg: $arg" >&2
            exit 1
            ;;
    esac
done

log() { printf '\033[1;36m[install]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[install]\033[0m %s\n' "$*" >&2; exit 1; }

# --- Tool checks ---
if [ "$DO_BACKEND" = 1 ]; then
    command -v python3 >/dev/null 2>&1 || fail "python3 not found in PATH"
fi
if [ "$DO_FRONTEND" = 1 ]; then
    command -v npm >/dev/null 2>&1 || fail "npm not found in PATH"
fi

# --- Backend ---
if [ "$DO_BACKEND" = 1 ]; then
    cd "$REPO_DIR/backend"
    if [ ! -d .venv ]; then
        log "creating venv at backend/.venv"
        python3 -m venv .venv
    else
        log "reusing existing venv at backend/.venv"
    fi
    log "upgrading pip"
    .venv/bin/pip install --quiet --upgrade pip
    log "installing python deps"
    .venv/bin/pip install --quiet -r requirements.txt
    log "backend ready"
fi

# --- Frontend ---
if [ "$DO_FRONTEND" = 1 ]; then
    cd "$REPO_DIR/frontend"
    if [ -f package-lock.json ]; then
        log "running npm ci"
        npm ci --no-audit --no-fund
    else
        log "running npm install"
        npm install --no-audit --no-fund
    fi
    if [ "$DO_BUILD" = 1 ]; then
        log "building frontend (tsc + vite build)"
        npm run build
    else
        log "skipping production build (--no-build)"
    fi
    log "frontend ready"
fi

cat <<EOF

==========================================================
 Install complete.

 Run the dashboard (loopback only by default):
   $REPO_DIR/backend/.venv/bin/python -m uvicorn app.main:app \\
     --app-dir $REPO_DIR/backend \\
     --host 127.0.0.1 --port 18790

 Open: http://127.0.0.1:18790
 (frontend dist is auto-served by FastAPI)

 Optional env vars:
   OPENCLAW_DASHBOARD_TOKEN   # bearer token for non-loopback access
   OPENCLAW_DASHBOARD_CORS    # comma-separated CORS origins
==========================================================
EOF
