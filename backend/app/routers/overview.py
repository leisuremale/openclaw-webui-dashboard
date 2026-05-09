from fastapi import APIRouter, HTTPException
from app.services.openclaw import service

router = APIRouter(prefix="/api")

ALLOWED_LOG_TYPES = {"stdout", "stderr"}

@router.get("/overview")
def get_overview():
    return service.get_overview()

@router.get("/agents")
def get_agents():
    return service.get_agents()

@router.get("/agents/metrics")
def get_all_agents_metrics():
    """Return 7-day metrics summary for all agents."""
    return service.get_all_agents_metrics()

@router.get("/cron")
def get_cron():
    return service.get_cron_jobs()

@router.get("/skills/{agent_id}")
def get_skills(agent_id: str):
    agents = service.get_agents()
    workspace = None
    for a in agents:
        if a.get("id") == agent_id:
            workspace = a.get("workspace")
            break
    return service.get_skills_for_agent(agent_id, workspace)

@router.get("/models")
def get_models():
    return service.get_models_info()

@router.get("/logs/analysis")
def get_log_analysis(lines: int = 500):
    """Analyze dashboard + gateway logs and return structured insights."""
    return service.get_log_analysis(lines)

@router.get("/logs/{log_type}")
def get_logs(log_type: str, lines: int = 200):
    """Read tail of dashboard logs. log_type: stdout or stderr"""
    if log_type not in ALLOWED_LOG_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid log_type. Allowed: {sorted(ALLOWED_LOG_TYPES)}",
        )
    return service.get_logs(log_type, lines)

@router.get("/version")
def get_version():
    return service.get_version_info()

@router.get("/version/history")
def get_version_history():
    """Return historical openclaw upgrade records (version → install time)."""
    return service.get_version_history()

@router.get("/open-path")
def open_path(path: str):
    """Open a file or directory in Finder (macOS only)."""
    return service.open_path(path)

@router.get("/agents/{agent_id}/metrics")
def get_agent_metrics(agent_id: str):
    """Return daily message/token/response-time metrics for an agent."""
    return service.get_agent_metrics(agent_id)

@router.get("/sessions/active")
def get_active_sessions():
    """Return all active sessions (updated within 15 minutes) across all agents."""
    return service.get_active_sessions()

@router.get("/models/usage")
def get_model_usage():
    """Return cached model usage data."""
    return service.get_model_usage()

@router.post("/models/usage/refresh/{provider}")
def refresh_model_usage(provider: str):
    """Refresh model usage data for a provider."""
    if provider == "minimax":
        return service.refresh_minimax_usage()
    if provider == "deepseek":
        return service.refresh_deepseek_usage()
    return {"ok": False, "error": f"unsupported provider: {provider}"}
