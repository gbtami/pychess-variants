from __future__ import annotations

import math
import re
from datetime import UTC, datetime

import aiohttp_session
from aiohttp import web
from json_utils import json_response as msgspec_json_response

from forum.constants import MENTION_RE

FORUM_ERROR_CODES = {
    "Forum unavailable": "forum_unavailable",
    "Invalid category": "invalid_category",
    "Category not found": "category_not_found",
    "Not allowed": "not_allowed",
    "Invalid topic": "invalid_topic",
    "Invalid topic id": "invalid_topic_id",
    "Topic not found": "topic_not_found",
    "Search text too long": "search_text_too_long",
    "Login required": "login_required",
    "You cannot post in this forum": "cannot_post",
    "Invalid request": "invalid_request",
    "Topic title is too short": "topic_title_too_short",
    "Topic title is too long": "topic_title_too_long",
    "Message is too short": "message_too_short",
    "Please solve the captcha.": "captcha_required",
    "Too many similar messages. Please wait and retry.": "too_many_similar_messages",
    "This topic is closed": "topic_closed",
    "Post not found": "post_not_found",
    "Post can no longer be edited": "post_edit_expired",
    "Invalid reaction": "invalid_reaction",
    "Cannot react to deleted posts": "cannot_react_deleted_post",
    "Cannot react to your own post": "cannot_react_own_post",
    "Team forum topics cannot be relocated": "team_topic_relocation_forbidden",
    "Only the first post can relocate a thread": "first_post_required",
    "Invalid target category": "invalid_target_category",
    "Already in that category": "already_in_category",
    "Target category not found": "target_category_not_found",
}


def forum_error_code(message: str) -> str | None:
    if message.startswith("Message too long (max "):
        return "message_too_long"
    return FORUM_ERROR_CODES.get(message)


async def session_username(request: web.Request) -> str | None:
    """Extract the logged-in username from the current aiohttp session."""
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


def to_utc(value: object) -> datetime | None:
    """Normalize a datetime-like value to UTC, returning None for non-datetime inputs."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def slugify(value: str) -> str:
    """Create a forum-safe slug from user text using lila-compatible constraints."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if len(slug) < 3:
        slug = f"topic-{datetime.now(UTC).strftime('%H%M%S')}"
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


def json_response(payload: dict[str, object], *, status: int = 200) -> web.Response:
    """Serialize API payloads with datetime ISO formatting and stable error codes."""
    if payload.get("type") == "error" and "code" not in payload:
        message = payload.get("message")
        if isinstance(message, str):
            code = forum_error_code(message)
            if code is not None:
                payload = {**payload, "code": code}
    return msgspec_json_response(payload, status=status)
