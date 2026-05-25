import json
import os

OPENCLAW_ROOT = os.path.expanduser("~/.openclaw")
AGENTS_DIR = os.path.join(OPENCLAW_ROOT, "agents")
OPENCLAW_CONFIG_PATH = os.path.join(OPENCLAW_ROOT, "openclaw.json")

AGENT_NAME_MAP = {
    "main": "小叮当",
    "mo-yan": "墨言",
    "mo-ping": "墨评",
    "xiao-le": "小乐",
    "cto": "CTO",
    "ma-nong": "码农",
    "an-bao": "安保",
    "xiao-xing": "小星",
    "xiao-zhi": "小智",
    "bei-ma": "贝玛",
}

AGENT_ORDER = [
    "main", "xiao-le", "xiao-zhi", "mo-yan", "an-bao",
    "cto", "ma-nong", "xiao-xing", "bei-ma", "mo-ping",
]


def default_emoji(agent_id: str) -> str:
    """Emoji used when openclaw.json doesn't specify one for this agent."""
    return "🎯" if agent_id == "main" else "🤖"


def load_agent_identities() -> dict[str, dict[str, str]]:
    """Read openclaw.json and return {agent_id: {"name": str, "emoji": str}}.

    Falls back to AGENT_NAME_MAP / default_emoji for fields the config
    omits. Returns {} if the config can't be read.

    Centralised here so callers (overview service, collab service) don't
    duplicate the parsing logic.
    """
    try:
        with open(OPENCLAW_CONFIG_PATH) as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    agents = config.get("agents", {}).get("list", [])
    out: dict[str, dict[str, str]] = {}
    for a in agents:
        if not isinstance(a, dict):
            continue
        aid = a.get("id", "main")
        identity = a.get("identity", {}) if isinstance(a.get("identity"), dict) else {}
        name = identity.get("name") or a.get("name") or AGENT_NAME_MAP.get(aid, aid)
        emoji = identity.get("emoji") or default_emoji(aid)
        out[aid] = {"name": name, "emoji": emoji}
    return out
