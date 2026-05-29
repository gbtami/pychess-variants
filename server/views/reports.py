from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Mapping

import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from report_api import REPORT_REASON_LABELS, TIMEOUT_REASONS
from settings import ADMINS
from typing_defs import ViewContext
from views import get_user_context

REPORT_SOURCE_LABELS: dict[str, str] = {
    "game": "Game report",
    "inbox": "Inbox report",
    "profile": "Profile report",
}

REPORT_ACTION_LABELS: dict[str, str] = {
    "close_account": "Account closed",
    "shadowban": "User shadowbanned",
}


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _report_source_context(report: Mapping[str, Any]) -> tuple[str, str]:
    url = str(report.get("url") or "").strip()
    if url:
        if url.startswith("/") or url.startswith("http://") or url.startswith("https://"):
            return ("Context link", url)
        return ("Context link", "")

    source = str(report.get("source") or "").strip().lower()
    if source == "game":
        game_id = str(report.get("gameId") or "").strip()
        if game_id:
            return (f"Game /{game_id}", f"/{game_id}")
    elif source == "profile":
        suspect = str(report.get("suspect") or "").strip()
        if suspect:
            return (f"Profile @{suspect}", f"/@/{suspect}")
    elif source == "inbox":
        thread = str(report.get("thread") or "").strip()
        msgs = report.get("msgs")
        msg_count = len(msgs) if isinstance(msgs, list) else 0
        if thread:
            msg_label = f" ({msg_count} msg)" if msg_count else ""
            return (f"Thread {thread}{msg_label}", "")
        if msg_count:
            return (f"{msg_count} reported message(s)", "")
    return ("", "")


def _message_ids(report: Mapping[str, Any], limit: int = 4) -> list[str]:
    raw = report.get("msgs")
    if not isinstance(raw, Iterable) or isinstance(raw, (str, bytes)):
        return []
    ids: list[str] = []
    for msg_id in raw:
        msg = str(msg_id).strip()
        if msg:
            ids.append(msg)
        if len(ids) >= limit:
            break
    return ids


def _message_count(report: Mapping[str, Any]) -> int:
    raw = report.get("msgs")
    if not isinstance(raw, Iterable) or isinstance(raw, (str, bytes)):
        return 0
    return sum(1 for msg_id in raw if str(msg_id).strip())


def _compact_message(text: str, max_len: int = 170) -> str:
    condensed = " ".join(text.split())
    if len(condensed) <= max_len:
        return condensed
    return f"{condensed[: max_len - 1]}…"


async def _load_inbox_message_map(
    app_state, reports: list[dict[str, Any]]
) -> dict[str, dict[str, str]]:
    msg_ids: list[str] = []
    for report in reports:
        if str(report.get("source") or "").strip().lower() != "inbox":
            continue
        msg_ids.extend(_message_ids(report))
    if not msg_ids:
        return {}

    seen: set[str] = set()
    unique_ids: list[str] = []
    for msg_id in msg_ids:
        if msg_id in seen:
            continue
        seen.add(msg_id)
        unique_ids.append(msg_id)
        if len(unique_ids) >= 2000:
            break

    cursor = app_state.db.inbox_msg.find(
        {"_id": {"$in": unique_ids}},
        projection={"_id": 1, "from": 1, "text": 1},
    )
    docs = await cursor.to_list(length=len(unique_ids))
    message_map: dict[str, dict[str, str]] = {}
    for doc in docs:
        msg_id = str(doc.get("_id") or "").strip()
        if not msg_id:
            continue
        message_map[msg_id] = {
            "from": str(doc.get("from") or ""),
            "text": _compact_message(str(doc.get("text") or "")),
        }
    return message_map


def _report_resolution_label(report: Mapping[str, Any]) -> str:
    action = str(report.get("moderationAction") or "").strip().lower()
    if not action:
        return "Resolved without direct account action"
    if action.startswith("silence:"):
        reason_key = action.split(":", 1)[1]
        reason = TIMEOUT_REASONS.get(reason_key, reason_key.replace("_", " "))
        return f"Timed out for 15 minutes ({reason})"
    return REPORT_ACTION_LABELS.get(action, action.replace("_", " ").replace(":", " ").title())


@aiohttp_jinja2.template("reports.html")
async def reports(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if not _is_admin_username(user.username):
        raise web.HTTPForbidden()

    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable()

    status = request.rel_url.query.get("status", "open")
    if status not in ("open", "processed", "all"):
        status = "open"

    query: dict[str, object] = {}
    if status in ("open", "processed"):
        query["status"] = status

    cursor = app_state.db.user_report.find(query)
    cursor.sort("createdAt", -1)
    cursor.limit(500)
    raw_report_docs = await cursor.to_list(length=500)
    inbox_msg_map = await _load_inbox_message_map(app_state, raw_report_docs)

    report_docs: list[dict[str, object]] = []
    for doc in raw_report_docs:
        reason = str(doc.get("reason", "other"))
        source = str(doc.get("source") or "").strip().lower()
        entry = dict(doc)
        entry["reasonLabel"] = REPORT_REASON_LABELS.get(reason, reason.replace("_", " ").title())
        entry["sourceLabel"] = REPORT_SOURCE_LABELS.get(source, source.replace("_", " ").title())
        source_context_label, source_context_url = _report_source_context(entry)
        entry["sourceContextLabel"] = source_context_label
        entry["sourceContextUrl"] = source_context_url
        msg_ids = _message_ids(entry)
        entry["sourceMsgCount"] = _message_count(entry)
        entry["sourceMsgSnippets"] = [
            {
                "id": msg_id,
                "from": inbox_msg_map.get(msg_id, {}).get("from", ""),
                "text": inbox_msg_map.get(msg_id, {}).get("text", "Message unavailable"),
            }
            for msg_id in msg_ids
        ]
        entry["resolutionLabel"] = _report_resolution_label(entry)
        report_docs.append(entry)

    open_count = await app_state.db.user_report.count_documents({"status": "open"})
    processed_count = await app_state.db.user_report.count_documents({"status": "processed"})

    context["title"] = "Reports • PyChess"
    context["view"] = "reports"
    context["view_css"] = "reports.css"
    context["admin"] = True
    context["reports"] = report_docs
    context["report_status"] = status
    context["report_open_count"] = open_count
    context["report_processed_count"] = processed_count
    return context
