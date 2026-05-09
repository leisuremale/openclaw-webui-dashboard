import os

OPENCLAW_ROOT = os.path.expanduser("~/.openclaw")

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
