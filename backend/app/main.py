import hmac
import ipaddress
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.routers import overview, collab

logger = logging.getLogger(__name__)

app = FastAPI(title="Openclaw Dashboard", version="0.1.0")


def _is_loopback_client(host: str | None) -> bool:
    if not host:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class AuthMiddleware(BaseHTTPMiddleware):
    """Loopback bypasses; non-loopback requires Bearer OPENCLAW_DASHBOARD_TOKEN."""

    async def dispatch(self, request, call_next):
        client_host = request.client.host if request.client else None
        if _is_loopback_client(client_host):
            return await call_next(request)

        token = os.environ.get("OPENCLAW_DASHBOARD_TOKEN")
        if not token:
            logger.warning(
                "Rejecting non-loopback request from %s (no token configured)",
                client_host,
            )
            return JSONResponse(
                status_code=403,
                content={
                    "detail": (
                        "Dashboard refuses non-loopback access. Bind to "
                        "127.0.0.1 or set OPENCLAW_DASHBOARD_TOKEN to enable "
                        "bearer-token auth."
                    )
                },
            )

        provided = request.headers.get("Authorization", "")
        expected = f"Bearer {token}"
        if not hmac.compare_digest(provided, expected):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid bearer token"},
            )
        return await call_next(request)


# Disable caching for SPA assets so refreshes always get latest build
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/assets/") or (not path.startswith("/api/") and "." not in path):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheMiddleware)
app.add_middleware(AuthMiddleware)

# CORS: defaults to localhost dev server; override via OPENCLAW_DASHBOARD_CORS
# (comma-separated origins). Set to "*" to allow any origin (not recommended).
_default_cors = "http://localhost:5173,http://127.0.0.1:5173"
_cors_origins = [
    o.strip()
    for o in os.environ.get("OPENCLAW_DASHBOARD_CORS", _default_cors).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview.router)
app.include_router(collab.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}

# Serve static frontend (production mode)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "../../frontend/dist")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't masquerade API 404s as the SPA shell.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"detail": "Dashboard not built. Run npm run build in frontend/"}
