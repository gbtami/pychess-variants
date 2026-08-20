from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import aiohttp_session
from admin import resolve_existing_username
from admin_api import record_mod_action
from aiohttp import web
from const import ANON_PREFIX, RESERVED_USERS, reserved
from inbox_api import MAX_MSG_LEN, send_system_inbox_messages
from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from settings import ADMINS

SYSTEM_MESSAGE_ACTIVE_DAYS = 180
SYSTEM_MESSAGE_MAX_SELECTED = 200
SYSTEM_MESSAGE_LOG_ACTION = "system_message_sent"
SITE_LOG_TARGET = "site"


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _error(message: str, status: int) -> web.Response:
    return json_response({"type": "error", "message": message}, status=status)


def _selected_tokens(raw: object) -> list[str]:
    values = [token.lstrip("@") for token in re.split(r"[,;\s]+", str(raw or "")) if token]
    return list(dict.fromkeys(values))


def _eligible_live_user(user) -> bool:
    user.update_online()
    return bool(
        user.online
        and not user.anon
        and not user.bot
        and user.enabled
        and not user.username.startswith(ANON_PREFIX)
        and not reserved(user.username)
    )


async def _selected_recipients(app_state, raw: object) -> tuple[list[str], list[str]]:
    candidates = _selected_tokens(raw)
    if not candidates:
        return [], ["Enter at least one username."]
    if len(candidates) > SYSTEM_MESSAGE_MAX_SELECTED:
        return [], [f"Select at most {SYSTEM_MESSAGE_MAX_SELECTED} users at once."]

    resolved: list[str] = []
    errors: list[str] = []
    for candidate in candidates:
        if reserved(candidate):
            errors.append(f"{candidate}: system/BOT accounts cannot receive this message")
            continue
        username = await resolve_existing_username(app_state, candidate)
        if username is None:
            errors.append(f"{candidate}: user not found")
            continue
        if username in resolved:
            continue
        doc = await app_state.db.user.find_one(
            {"_id": username}, projection={"enabled": 1, "title": 1}
        )
        if doc is None:
            errors.append(f"{candidate}: user not found")
        elif not bool(doc.get("enabled", True)):
            errors.append(f"{username}: account is disabled")
        elif str(doc.get("title") or "") == "BOT" or reserved(username):
            errors.append(f"{username}: system/BOT accounts cannot receive this message")
        else:
            resolved.append(username)
    return resolved, errors


async def _active_recipients(app_state) -> list[str]:
    cutoff = datetime.now(UTC) - timedelta(days=SYSTEM_MESSAGE_ACTIVE_DAYS)
    recent = await app_state.db.game.distinct("us", {"d": {"$gte": cutoff}})
    candidates = {str(username) for username in recent if isinstance(username, str)}
    candidates.update(
        user.username for user in app_state.users.values() if _eligible_live_user(user)
    )
    candidates.difference_update(RESERVED_USERS)
    if not candidates:
        return []

    recipients: list[str] = []
    names = list(candidates)
    for offset in range(0, len(names), 500):
        batch = names[offset : offset + 500]
        cursor = app_state.db.user.find(
            {
                "_id": {"$in": batch},
                "enabled": {"$ne": False},
                "title": {"$ne": "BOT"},
            },
            projection={"_id": 1},
        )
        async for doc in cursor:
            username = doc.get("_id")
            if isinstance(username, str) and not reserved(username):
                recipients.append(username)
    return sorted(set(recipients), key=str.casefold)


def _audit_details(audience: str, recipients: list[str], text: str) -> str:
    excerpt = " ".join(text.split())[:160]
    if audience == "selected":
        target = ", ".join(recipients[:12])
        if len(recipients) > 12:
            target += f", +{len(recipients) - 12} more"
        return f"selected · {len(recipients)} recipient(s): {target} · {excerpt}"
    return f"active {SYSTEM_MESSAGE_ACTIVE_DAYS}d · {len(recipients)} recipient(s) · {excerpt}"


async def system_message_send(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    raw_moderator = session.get("user_name")
    moderator = raw_moderator if isinstance(raw_moderator, str) else None

    if moderator is None:
        return _error("Login required", 401)
    if not _is_admin_username(moderator):
        return _error("Admin only", 403)
    if app_state.db is None:
        return _error("Database unavailable", 503)

    data = await read_post_data(request)
    if data is None:
        return _error("Invalid request", 400)

    text = str(data.get("text") or "").strip()
    if not text:
        return _error("Message is empty", 400)
    if len(text) > MAX_MSG_LEN:
        return _error(f"Message too long (max {MAX_MSG_LEN})", 400)

    audience = str(data.get("audience") or "selected")
    if audience == "selected":
        recipients, errors = await _selected_recipients(app_state, data.get("recipients"))
        if errors:
            return _error("; ".join(errors), 400)
    elif audience == "active":
        recipients = await _active_recipients(app_state)
    else:
        return _error("Invalid recipient audience", 400)

    if not recipients:
        return _error("No eligible recipients found", 400)

    sent = await send_system_inbox_messages(app_state, recipients, text)
    await record_mod_action(
        app_state,
        moderator,
        SITE_LOG_TARGET,
        SYSTEM_MESSAGE_LOG_ACTION,
        _audit_details(audience, recipients, text),
    )
    return json_response(
        {
            "ok": True,
            "action": SYSTEM_MESSAGE_LOG_ACTION,
            "message": f"System message sent to {sent} user(s).",
            "recipientCount": sent,
        }
    )
