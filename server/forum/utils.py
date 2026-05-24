from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from functools import partial

import aiohttp_session
from aiohttp import web

from forum.constants import MENTION_RE


async def session_username(request: web.Request) -> str | None:
    """Extract the logged-in username from the current aiohttp session."""
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


def to_utc(value: object) -> datetime | None:
    """Normalize a datetime-like value to UTC, returning None for non-datetime inputs."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def slugify(value: str) -> str:
    """Create a forum-safe slug from user text using lila-compatible constraints."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if len(slug) < 3:
        slug = f"topic-{datetime.now(timezone.utc).strftime('%H%M%S')}"
    return slug[:80]


def escape_regex(value: str) -> str:
    """Escape free-form search input before placing it into a regex query."""
    return re.escape(value)


def page_count(total: int, per_page: int) -> int:
    """Compute a one-based page count and always return at least one page."""
    return max(1, math.ceil(total / per_page)) if per_page > 0 else 1


def normalize_page(raw: str | None, nb_pages: int) -> int:
    """Clamp a user-provided page value into the valid one-based page range."""
    try:
        page = int(raw or "1")
    except ValueError:
        page = 1
    if page < 1:
        return 1
    if page > nb_pages:
        return nb_pages
    return page


def post_page_for_index(post_index: int, per_page: int) -> int:
    """Convert a zero-based post index into its one-based paginated page number."""
    return max(1, (post_index // per_page) + 1)


def parse_bool(value: str | None) -> bool:
    """Parse common truthy request tokens used by reaction endpoints."""
    if value is None:
        return False
    return value.lower() in ("1", "true", "yes", "on")


def extract_mentions(text: str) -> set[str]:
    """Extract unique @mentions from sanitized forum markdown/plain text."""
    return {match.group(2) for match in MENTION_RE.finditer(text)}


def normalize_captcha_solution(value: str) -> str:
    """Normalize captcha move input to lowercase `<orig> <dest>` format."""
    return " ".join(value.strip().lower().split())


def parse_square(move: str, start: int) -> tuple[str, int] | None:
    """Parse one square token (`file` + one/more digits) from move text."""
    if start >= len(move):
        return None
    if not move[start].isalpha():
        return None
    idx = start + 1
    while idx < len(move) and move[idx].isdigit():
        idx += 1
    if idx == start + 1:
        return None
    return move[start:idx], idx


def uci_orig_dest(move: str) -> tuple[str, str] | None:
    """Extract origin/destination squares from a UCI-like move string."""
    uci = move.strip().lower()
    if len(uci) < 4 or "," in uci or "@" in uci:
        return None
    orig_token = parse_square(uci, 0)
    if orig_token is None:
        return None
    orig, idx = orig_token
    dest_token = parse_square(uci, idx)
    if dest_token is None:
        return None
    dest, idx = dest_token
    suffix = uci[idx:]
    if any((not char.isalnum()) and char != "+" for char in suffix):
        return None
    return orig, dest


def captcha_moves_map(legal_moves: list[str]) -> dict[str, str]:
    """Encode legal moves into lila-compatible orig->dests compact map."""
    grouped: dict[str, list[str]] = {}
    for move in legal_moves:
        orig_dest = uci_orig_dest(move)
        if orig_dest is None:
            continue
        orig, dest = orig_dest
        dests = grouped.setdefault(orig, [])
        if dest not in dests:
            dests.append(dest)
    return {orig: "".join(dests) for orig, dests in grouped.items()}


def json_response(payload: dict[str, object]) -> web.Response:
    """Serialize API payloads with datetime ISO formatting."""
    return web.json_response(payload, dumps=partial(json.dumps, default=datetime.isoformat))
