from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from functools import partial

import aiohttp_session
from aiohttp import web

from newid import new_id
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from settings import ADMINS

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")
GAME_ID_RE = re.compile(r"^\w{8}$")

REPORT_REASONS = {
    "cheating",
    "bad_behavior",
    "harassment",
    "spam",
    "impersonation",
    "other",
}
REPORT_SOURCES = {"inbox", "profile", "game"}
MAX_DETAILS_LEN = 3000


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


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


async def report_create(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    data = await read_post_data(request)
    if data is None:
        return web.json_response({"type": "error", "message": "Invalid request"}, status=400)

    source = str(data.get("source") or "").strip().lower()
    reason = str(data.get("reason") or "").strip().lower().replace(" ", "_")
    details = str(data.get("details") or "").strip()
    raw_suspect = str(data.get("suspect") or "").strip()
    game_id = str(data.get("gameId") or "").strip()
    thread = str(data.get("thread") or "").strip()
    url = str(data.get("url") or "").strip()

    if source not in REPORT_SOURCES:
        return web.json_response({"type": "error", "message": "Invalid report source"}, status=400)

    if reason not in REPORT_REASONS:
        return web.json_response({"type": "error", "message": "Invalid report reason"}, status=400)

    if len(details) < 5:
        return web.json_response(
            {"type": "error", "message": "Report details are too short"}, status=400
        )
    if len(details) > MAX_DETAILS_LEN:
        return web.json_response(
            {
                "type": "error",
                "message": f"Report details too long (max {MAX_DETAILS_LEN} characters)",
            },
            status=400,
        )

    suspect = await _resolve_username(app_state, raw_suspect)
    if suspect is None:
        return web.json_response({"type": "error", "message": "User not found"}, status=404)

    if suspect.casefold() == username.casefold():
        return web.json_response(
            {"type": "error", "message": "You cannot report yourself"}, status=400
        )

    if source == "game":
        if not GAME_ID_RE.match(game_id):
            return web.json_response({"type": "error", "message": "Invalid game ID"}, status=400)

        game_doc = await app_state.db.game.find_one({"_id": game_id}, projection={"us": 1})
        if game_doc is None:
            return web.json_response({"type": "error", "message": "Game not found"}, status=404)

        users = game_doc.get("us", [])
        if not isinstance(users, list) or suspect not in users:
            return web.json_response(
                {
                    "type": "error",
                    "message": "Reported user is not a participant in this game",
                },
                status=400,
            )

    now = datetime.now(timezone.utc)
    report_id = await new_id(app_state.db.user_report)
    report_doc: dict[str, object] = {
        "_id": report_id,
        "status": "open",
        "source": source,
        "reason": reason,
        "details": details,
        "reporter": username,
        "suspect": suspect,
        "createdAt": now,
        "updatedAt": now,
        "inquiryBy": "",
    }

    if game_id:
        report_doc["gameId"] = game_id
    if thread:
        report_doc["thread"] = thread
    if url:
        report_doc["url"] = url[:500]

    await app_state.db.user_report.insert_one(report_doc)

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
    now = datetime.now(timezone.utc)
    result = await app_state.db.user_report.update_one(
        {"_id": report_id},
        {
            "$set": {
                "status": "processed",
                "processedBy": username,
                "processedAt": now,
                "updatedAt": now,
            }
        },
    )
    if result.matched_count == 0:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    return web.json_response({"ok": True})


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
            "$unset": {"processedBy": "", "processedAt": ""},
        },
    )
    if result.matched_count == 0:
        return web.json_response({"type": "error", "message": "Report not found"}, status=404)

    return web.json_response({"ok": True})
