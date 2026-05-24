from fastapi import APIRouter
from app.services.collab import get_collab_status

router = APIRouter(prefix="/api/collab")


@router.get("/status")
def collab_status():
    """Return collab status: tools, active ACP tasks, today stats, history."""
    return get_collab_status()
