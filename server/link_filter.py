from __future__ import annotations

import re

# Fast-path markers: if absent, skip all regex work.
_FAST_MARKERS = (
    "http",
    "www.",
    ".com",
    ".org",
    ".net",
    ".io",
    ".gg",
    ".ly",
    ".su",
    ".cfd",
    ".life",
    "/auth/",
    "/signup/",
    "/password/",
)

_REPLACEMENTS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Referral links: keep destination but strip referral token.
    (
        re.compile(r"""(?i)\bchess\.com/(?:register|membership)\?ref(?:id|_id)=[\w-]+"""),
        "chess.com",
    ),
    (re.compile(r"""(?i)\bgo\.chess\.com/[\w-]+"""), "chess.com"),
    (re.compile(r"""(?i)\baimchess\.com/try\?ref=[\w-]+"""), "aimchess.com"),
    (re.compile(r"""(?i)\baimchess\.com/i/[\w-]+"""), "aimchess.com"),
    (re.compile(r"""(?i)\bendgame\.ai/login\?t=r&ref=[\w-]+"""), "endgame.ai"),
    # Known spammy shorteners/domains.
    (re.compile(r"""(?i)\b(?:https?://)?(?:www\.)?tinyurl\.com/\S+"""), "[redacted]"),
    (re.compile(r"""(?i)\b(?:https?://)?(?:www\.)?bit\.ly/\S+"""), "[redacted]"),
    (re.compile(r"""(?i)\b(?:https?://)?(?:www\.)?t\.ly/\S+"""), "[redacted]"),
    (re.compile(r"""(?i)\b(?:https?://)?(?:www\.)?wbt\.link/\S+"""), "[redacted]"),
    (re.compile(r"""(?i)\b(?:https?://)?(?:www\.)?hide\.su/\S+"""), "[redacted]"),
    # Sensitive one-time paths should never be posted publicly.
    (re.compile(r"""(?i)\b\S*/auth/magic-link/login/\S*"""), "[redacted]"),
    (re.compile(r"""(?i)\b\S*/auth/token/\S*"""), "[redacted]"),
    (re.compile(r"""(?i)\b\S*/signup/confirm/\S*"""), "[redacted]"),
    (re.compile(r"""(?i)\b\S*/password/reset/confirm/\S*"""), "[redacted]"),
    # Bot-cheat promotion links.
    (re.compile(r"""(?i)\bchess-bot(?:\.com)?[^\s]*"""), "[redacted]"),
)


def sanitize_user_message(text: str) -> str:
    lowered = text.lower()
    if not any(marker in lowered for marker in _FAST_MARKERS):
        return text

    sanitized = text
    for regex, replacement in _REPLACEMENTS:
        sanitized = regex.sub(replacement, sanitized)
    return sanitized
