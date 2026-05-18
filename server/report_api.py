from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from functools import partial
from typing import Any, Mapping

import aiohttp_session
from aiohttp import web

from admin import ban, silence
from newid import new_id
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from settings import ADMINS

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")
GAME_ID_RE = re.compile(r"^\w{8}$")

REPORT_REASONS = {
    "cheat",
    "stall",
    "boost",
    "verbal_abuse",
    "violence",
    "harass",
    "self_harm",
    "hate",
    "username",
    "cheating",
    "bad_behavior",
    "harassment",
    "spam",
    "impersonation",
    "other",
}
REPORT_SOURCES = {"inbox", "profile", "game"}
MAX_DETAILS_LEN = 3000

REPORT_REASON_LABELS: dict[str, str] = {
    "cheat": "Cheating",
    "stall": "Stalling / Leaving games",
    "boost": "Sandbagging / Boosting / Match fixing",
    "verbal_abuse": "Verbal abuse / Cursing / Trolling",
    "violence": "Violence / Threats",
    "harass": "Harassment / Bullying / Stalking",
    "self_harm": "Suicide / Self-Injury",
    "hate": "Hate Speech / Sexism",
    "spam": "Spamming",
    "username": "Username",
    "other": "Other",
    "cheating": "Cheating",
    "bad_behavior": "Bad behavior",
    "harassment": "Harassment / Bullying / Stalking",
    "impersonation": "Impersonation",
}


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


async def _mark_report_processed(
    app_state,
    report_id: str,
    username: str,
    moderation_action: str | None = None,
) -> int:
    now = datetime.now(timezone.utc)
    update_set: dict[str, object] = {
        "status": "processed",
        "processedBy": username,
        "processedAt": now,
        "updatedAt": now,
    }
    if moderation_action is not None:
        update_set["moderationAction"] = moderation_action
    result = await app_state.db.user_report.update_one(
        {"_id": report_id},
        {"$set": update_set},
    )
    return result.matched_count


async def _report_suspect(app_state, report_id: str) -> str | None:
    report = await app_state.db.user_report.find_one({"_id": report_id}, projection={"suspect": 1})
    if report is None:
        return None

    suspect = report.get("suspect")
    return suspect if isinstance(suspect, str) and suspect else None


async def _session_username(request: web.Request) -> str | None:
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


async def _resolve_username(app_state, raw_username: str) -> str | None:
    candidate = raw_username.strip().lstrip("@")
    if not USERNAME_RE.match(candidate):
        return None

    if candidate in app_state.users:
        return candidate

    lowered = candidate.casefold()
    for username in app_state.users:
        if username.casefold() == lowered:
            return username

    if app_state.db is None:
        return None

    user_doc = await app_state.db.user.find_one(
        {
            "$or": [
                {"_id": candidate},
                {"username_lower": candidate.lower()},
                {"_id": {"$regex": f"^{re.escape(candidate)}$", "$options": "i"}},
            ]
        },
        projection={"_id": 1},
    )
    if user_doc is None:
        return None

    username = user_doc.get("_id")
    return username if isinstance(username, str) else None


async def create_report_submission(
    app_state,
    reporter: str,
    payload: Mapping[str, Any],
) -> tuple[int, str, str | None]:
    source = str(payload.get("source") or "").strip().lower()
    reason = str(payload.get("reason") or "").strip().lower().replace(" ", "_")
    details = str(payload.get("details") or "").strip()
    raw_suspect = str(payload.get("suspect") or payload.get("username") or "").strip()
    game_id = str(payload.get("gameId") or "").strip()
    thread = str(payload.get("thread") or "").strip()
    url = str(payload.get("url") or "").strip()

    if source not in REPORT_SOURCES:
        return (400, "Invalid report source", None)

    if reason not in REPORT_REASONS:
        return (400, "Invalid report reason", None)

    if len(details) < 5:
        return (400, "Report details are too short", None)
    if len(details) > MAX_DETAILS_LEN:
        return (400, f"Report details too long (max {MAX_DETAILS_LEN} characters)", None)

    suspect = await _resolve_username(app_state, raw_suspect)
    if suspect is None:
        return (404, "User not found", None)

    if suspect.casefold() == reporter.casefold():
        return (400, "You cannot report yourself", None)

    if source == "game":
        if not GAME_ID_RE.match(game_id):
            return (400, "Invalid game ID", None)

        game_doc = await app_state.db.game.find_one({"_id": game_id}, projection={"us": 1})
        if game_doc is None:
            return (404, "Game not found", None)

        users = game_doc.get("us", [])
        if not isinstance(users, list) or suspect not in users:
            return (400, "Reported user is not a participant in this game", None)

    msgs: list[str] = []
    getall = getattr(payload, "getall", None)
    if callable(getall):
        msgs = [str(msg_id).strip() for msg_id in getall("msgs", []) if str(msg_id).strip()]
        if len(msgs) > 30:
            msgs = msgs[:30]

    now = datetime.now(timezone.utc)
    report_id = await new_id(app_state.db.user_report)
    report_doc: dict[str, object] = {
        "_id": report_id,
        "status": "open",
        "source": source,
        "reason": reason,
        "details": details,
        "reporter": reporter,
        "suspect": suspect,
        "createdAt": now,
        "updatedAt": now,
        "inquiryBy": "",
    }

    if game_id:
        report_doc["gameId"] = game_id
    if thread:
        report_doc["thread"] = thread
    if msgs:
        report_doc["msgs"] = msgs
    if url:
        report_doc["url"] = url[:500]

    await app_state.db.user_report.insert_one(report_doc)

    return (200, "", report_id)


async def report_create(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    data = await read_post_data(request)
    if data is None:
        return web.json_response({"type": "error", "message": "Invalid request"}, status=400)

    status, message, report_id = await create_report_submission(app_state, username, data)
    if status >= 400:
        return web.json_response({"type": "error", "message": message}, status=status)
    return web.json_response({"ok": True, "reportId": report_id})


async def report_queue(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    status = request.rel_url.query.get("status", "open")
    if status not in ("open", "processed", "all"):
        status = "open"

    query: dict[str, object] = {}
    if status in ("open", "processed"):
        query["status"] = status

    try:
        limit = max(1, min(int(request.rel_url.query.get("limit", "200")), 500))
    except ValueError:
        limit = 200

    cursor = app_state.db.user_report.find(query)
    cursor.sort("createdAt", -1)
    cursor.limit(limit)
    reports = await cursor.to_list(length=limit)

    return web.json_response(
        {"reports": reports},
        dumps=partial(json.dumps, default=datetime.isoformat),
    )


async def report_inquiry(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    report_id = request.match_info.get("reportId", "")
    report = await app_state.db.user_report.find_one(
        {"_id": report_id}, projection={"inquiryBy": 1}
    )
    if report is None:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    inquiry_by = report.get("inquiryBy")
    now = datetime.now(timezone.utc)
    if isinstance(inquiry_by, str) and inquiry_by.casefold() == username.casefold():
        await app_state.db.user_report.update_one(
            {"_id": report_id},
            {"$set": {"inquiryBy": "", "updatedAt": now}},
        )
        return web.json_response({"ok": True, "inquiryBy": ""})

    await app_state.db.user_report.update_one(
        {"_id": report_id},
        {"$set": {"inquiryBy": username, "updatedAt": now}},
    )
    return web.json_response({"ok": True, "inquiryBy": username})


async def report_process(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    report_id = request.match_info.get("reportId", "")
    if await _mark_report_processed(app_state, report_id, username) == 0:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    return web.json_response({"ok": True})


async def report_silence(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    report_id = request.match_info.get("reportId", "")
    suspect = await _report_suspect(app_state, report_id)
    if suspect is None:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    fullchat = silence(app_state, f"/silence {suspect}")
    if fullchat is None:
        return web.json_response(
            {"type": "error", "message": "User must be online to silence"},
            status=409,
        )

    await app_state.lobby.lobby_broadcast(fullchat)
    await _mark_report_processed(app_state, report_id, username, moderation_action="silence")
    return web.json_response({"ok": True, "action": "silence"})


async def report_close_account(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    report_id = request.match_info.get("reportId", "")
    suspect = await _report_suspect(app_state, report_id)
    if suspect is None:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    await ban(app_state, f"/ban {suspect}")
    user_doc = await app_state.db.user.find_one({"_id": suspect}, projection={"enabled": 1})
    if user_doc is None:
        return web.json_response({"type": "error", "message": "User not found"}, status=404)
    if user_doc.get("enabled", True):
        return web.json_response(
            {"type": "error", "message": "Failed to close account"},
            status=409,
        )

    await _mark_report_processed(app_state, report_id, username, moderation_action="close_account")
    return web.json_response({"ok": True, "action": "close_account"})


async def report_reopen(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)
    if not _is_admin_username(username):
        return web.json_response({"type": "error", "message": "Admin only"}, status=403)

    report_id = request.match_info.get("reportId", "")
    now = datetime.now(timezone.utc)
    result = await app_state.db.user_report.update_one(
        {"_id": report_id},
        {
            "$set": {
                "status": "open",
                "updatedAt": now,
                "inquiryBy": username,
            },
            "$unset": {"processedBy": "", "processedAt": "", "moderationAction": ""},
        },
    )
    if result.matched_count == 0:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    return web.json_response({"ok": True})
