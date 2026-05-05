#!/bin/bash
# OpenClaw Dashboard - unified launcher
# Starts both backend (FastAPI :18790) and frontend (Vite :5173)

DASHBOARD_DIR="/Users/lijingyan/.openclaw/dashboard"
VENV_PYTHON="$DASHBOARD_DIR/backend/.venv/bin/python3"
NODE_BIN="/Users/lijingyan/.openclaw/tools/node-v22.22.0/bin/node"
PATH="$DASHBOARD_DIR/backend/.venv/bin:/Users/lijingyan/.openclaw/tools/node-v22.22.0/bin:$PATH"

cleanup() {
    echo "[dashboard] shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# --- Start backend ---
cd "$DASHBOARD_DIR/backend"
"$VENV_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 18790 &
BACKEND_PID=$!
echo "[dashboard] backend PID=$BACKEND_PID on :18790"

# --- Start frontend ---
cd "$DASHBOARD_DIR/frontend"
npx vite --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!
echo "[dashboard] frontend PID=$FRONTEND_PID on :5173"

# Monitor both; if either dies, kill the other and exit (launchd KeepAlive will restart)
while kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; do
    sleep 3
done

echo "[dashboard] a process died, exiting for restart..."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
exit 1
