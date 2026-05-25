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

# Opt-in: set to "1" if you deliberately run behind a trusted reverse proxy and
# have stripped X-Forwarded-For / Forwarded headers at that proxy, OR you want
# proxy-forwarded requests to still bypass auth when terminated at loopback.
# Default is OFF — a proxy-forwarded request never gets the loopback bypass.
_TRUST_PROXY = os.environ.get("OPENCLAW_DASHBOARD_TRUST_PROXY", "").lower() in {"1", "true", "yes"}

# Forwarded-for header names that indicate the request crossed a proxy hop.
# Presence of any of these disables loopback bypass unless explicitly opted in.
_PROXY_HEADERS = ("x-forwarded-for", "x-real-ip", "forwarded", "x-forwarded-host")


def _is_loopback_client(host: str | None) -> bool:
    if not host:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _has_proxy_hop(request) -> bool:
    return any(h in request.headers for h in _PROXY_HEADERS)


class AuthMiddleware(BaseHTTPMiddleware):
    """Loopback bypasses; non-loopback requires Bearer OPENCLAW_DASHBOARD_TOKEN.

    A request that traversed a reverse proxy (X-Forwarded-For / Forwarded /
    X-Real-IP present) is NOT considered loopback even if request.client.host
    is 127.0.0.1, because the dashboard cannot verify the upstream source.
    Set OPENCLAW_DASHBOARD_TRUST_PROXY=1 to opt out of this check (only safe
    when the proxy strips client-supplied forwarded headers).
    """

    async def dispatch(self, request, call_next):
        client_host = request.client.host if request.client else None
        is_loopback = _is_loopback_client(client_host)
        proxied = _has_proxy_hop(request)

        if is_loopback and not (proxied and not _TRUST_PROXY):
            return await call_next(request)

        token = os.environ.get("OPENCLAW_DASHBOARD_TOKEN")
        if not token:
            logger.warning(
                "Rejecting %s request from %s (no token configured)",
                "proxy-forwarded" if proxied else "non-loopback",
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


# Disable caching for the SPA shell (index.html + JS/CSS bundles) so the
# browser always picks up a fresh build. Static fingerprinted assets are
# served separately and may keep their default caching.
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        # Cache-bust: explicit SPA paths (assets bundle, index, anything that
        # has no file extension and isn't an API path). The previous "no dot
        # in path" heuristic misclassified routes like /foo.json.
        is_spa_html_path = (
            path == "/"
            or path == "/index.html"
            or (not path.startswith("/api/") and "." not in path.rsplit("/", 1)[-1])
        )
        if path.startswith("/assets/") or is_spa_html_path:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheMiddleware)
app.add_middleware(AuthMiddleware)

# CORS: defaults to localhost dev server; override via OPENCLAW_DASHBOARD_CORS
# (comma-separated origins). Set to "*" to allow any origin (not recommended).
#
# Note: browsers reject Access-Control-Allow-Origin:* with credentialed
# requests, so when the user sets "*" we force allow_credentials=False to keep
# the response coherent. The dashboard's bearer token lives in Authorization,
# which counts as credentials — so "*" effectively disables auth from a
# browser. We log a loud warning rather than silently breaking auth.
_default_cors = "http://localhost:5173,http://127.0.0.1:5173"
_cors_origins = [
    o.strip()
    for o in os.environ.get("OPENCLAW_DASHBOARD_CORS", _default_cors).split(",")
    if o.strip()
]
_cors_allow_credentials = True
if "*" in _cors_origins:
    logger.warning(
        "OPENCLAW_DASHBOARD_CORS=* is set. Forcing allow_credentials=False "
        "because browsers refuse Access-Control-Allow-Origin:* with "
        "credentialed requests. This means Authorization headers from "
        "browser fetch() calls will not be sent. Set an explicit origin "
        "list to keep auth working."
    )
    _cors_allow_credentials = False
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_allow_credentials,
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
