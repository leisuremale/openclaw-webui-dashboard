"""Translate 5-field cron expressions to short Chinese descriptions."""

WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"]


def _cron_to_human(expr: str) -> str:
    """Convert a 5-field cron expression to a Chinese description."""
    if not expr:
        return ""
    parts = expr.strip().split()
    if len(parts) != 5:
        return expr  # unrecognized format, return as-is

    minute, hour, dom, month, dow = parts

    # Build time part
    time_str = ""
    if hour == "*" and minute == "*":
        time_str = "每分钟"
    elif hour == "*" and minute != "*":
        if minute.startswith("*/"):
            n = minute[2:]
            time_str = f"每 {n} 分钟"
        else:
            time_str = f"每小时的第 {minute} 分"
    elif hour != "*" and minute == "*":
        time_str = f"每小时的第 {hour} 时"
    elif hour != "*" and minute != "*":
        if hour.startswith("*/") and minute == "0":
            n = hour[2:]
            time_str = f"每 {n} 小时"
        elif minute.startswith("*/") and hour == "*":
            pass  # handled above
        else:
            time_str = f"每天 {int(hour):02d}:{int(minute):02d}"

    # Build day part
    day_str = ""
    if dom != "*":
        day_str = f"每月 {dom} 日"
    if dow != "*":
        if dow.startswith("*/"):
            pass
        elif "-" in dow:
            start, end = dow.split("-")
            names = [WEEKDAY_NAMES[int(i)] for i in range(int(start), int(end) + 1)]
            day_str = "工作日" if names == ["一", "二", "三", "四", "五"] else f"每周{'、'.join(names)}"
        elif "," in dow:
            names = [WEEKDAY_NAMES[int(d)] for d in dow.split(",")]
            day_str = f"每周{'、'.join(names)}"
        else:
            try:
                day_str = f"每周{WEEKDAY_NAMES[int(dow)]}"
            except (ValueError, IndexError):
                pass

    # Build month part
    month_str = ""
    if month != "*":
        if "," in month:
            month_str = f"{month} 月"

    if day_str:
        return f"{day_str} {time_str}"
    if month_str:
        return f"每年{month_str} {time_str}"
    return time_str
