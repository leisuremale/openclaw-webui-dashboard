"""Cross-platform tail() — replaces `subprocess.run(["tail", ...])`.

The previous implementation shelled out to `tail`, which doesn't exist on
Windows. Pure-Python deque is portable, has no startup cost vs spawning a
subprocess, and handles long lines gracefully.
"""

from __future__ import annotations

import os
from collections import deque


def tail_lines(path: str, n: int = 200, encoding: str = "utf-8") -> list[str]:
    """Return the last `n` lines of `path` as a list of strings (no newlines).

    Returns [] if the file doesn't exist. Bytes that fail to decode are
    replaced — log files routinely contain mojibake from process output and
    we don't want a single bad byte to wipe out the whole tail.
    """
    if not os.path.isfile(path):
        return []
    if n <= 0:
        return []
    try:
        with open(path, "r", encoding=encoding, errors="replace", newline="") as f:
            buf: deque[str] = deque(f, maxlen=n)
    except OSError:
        return []
    return [line.rstrip("\r\n") for line in buf]
