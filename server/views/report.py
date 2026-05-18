from __future__ import annotations

from datetime import datetime, timezone

import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from report_api import REPORT_REASONS, REPORT_SOURCES, _resolve_username, create_report_submission
from request_utils import read_post_data
from typing_defs import ViewContext
from views import get_user_context


def _thread_id(user1: str, user2: str) -> str:
    first, second = sorted((user1, user2), key=lambda x: (x.lower(), x))
    return f"{first}:{second}"


async def _load_inbox_messages(app_state, reporter: str, suspect: str) -> list[dict[str, str]]:
    tid = _thread_id(reporter, suspect)
    cursor = app_state.db.inbox_msg.find(
        {"tid": tid, "deletedBy": {"$ne": reporter}},
        projection={"_id": 1, "from": 1, "text": 1, "createdAt": 1},
    )
    cursor.sort("createdAt", -1)
    cursor.limit(30)
    rows = await cursor.to_list(length=30)

    msgs: list[dict[str, str]] = []
    for row in rows:
        created_at = row.get("createdAt")
        if isinstance(created_at, datetime):
            created_at = created_at.astimezone(timezone.utc).isoformat()
        else:
            created_at = ""
        msgs.append(
            {
                "id": str(row.get("_id", "")),
                "from": str(row.get("from", "")),
                "text": str(row.get("text", "")),
                "createdAt": created_at,
            }
        )
    return msgs


async def _build_report_context(
    request: web.Request,
    context: ViewContext,
    reporter: str,
    source: str,
    username: str,
    reason: str,
    details: str,
    game_id: str,
    error: str,
    selected_msgs: list[str] | None = None,
) -> ViewContext:
    app_state = get_app_state(request.app)

    if source not in REPORT_SOURCES:
        source = "profile"
    if reason not in REPORT_REASONS:
        reason = "other"

    suspect = await _resolve_username(app_state, username) if username else None

    inbox_msgs: list[dict[str, str]] = []
    if source == "inbox" and suspect is not None:
        inbox_msgs = await _load_inbox_messages(app_state, reporter, suspect)

    context["title"] = "Report a user • PyChess"
    context["view"] = "report"
    context["view_css"] = "report.css"
    context["report_error"] = error
    context["report_source"] = source
    context["report_username"] = suspect or username
    context["report_reason"] = reason
    context["report_details"] = details
    context["report_game_id"] = game_id
    context["report_sources"] = sorted(REPORT_SOURCES)
    context["report_reasons"] = sorted(REPORT_REASONS)
    context["report_inbox_msgs"] = inbox_msgs
    context["report_selected_msgs"] = selected_msgs or []

    return context


@aiohttp_jinja2.template("report.html")
async def report_form(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/")

    source = request.rel_url.query.get("source", "profile")
    username = request.rel_url.query.get("username", "")
    reason = request.rel_url.query.get("reason", "other")
    game_id = request.rel_url.query.get("gameId", "")
    details = request.rel_url.query.get("details", "")

    return await _build_report_context(
        request,
        context,
        user.username,
        source,
        username,
        reason,
        details,
        game_id,
        error="",
    )


@aiohttp_jinja2.template("report.html")
async def report_create(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/")

    data = await read_post_data(request)
    if data is None:
        return await _build_report_context(
            request,
            context,
            user.username,
            source="profile",
            username="",
            reason="other",
            details="",
            game_id="",
            error="Invalid request",
        )

    source = str(data.get("source") or "profile")
    username = str(data.get("username") or "")
    reason = str(data.get("reason") or "other")
    details = str(data.get("details") or "")
    game_id = str(data.get("gameId") or "")

    selected_msgs: list[str] = []
    getall = getattr(data, "getall", None)
    if callable(getall):
        selected_msgs = [
            str(value).strip() for value in getall("msgs", []) if str(value).strip()
        ]

    status, message, _report_id = await create_report_submission(
        app_state=get_app_state(request.app), reporter=user.username, payload=data
    )
    if status >= 400:
        return await _build_report_context(
            request,
            context,
            user.username,
            source,
            username,
            reason,
            details,
            game_id,
            error=message,
            selected_msgs=selected_msgs,
        )

    raise web.HTTPFound(f"/report/thanks?username={username}")


@aiohttp_jinja2.template("report_thanks.html")
async def report_thanks(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/")

    context["title"] = "Thanks for the report • PyChess"
    context["view"] = "thanks"
    context["view_css"] = "report.css"
    context["report_username"] = request.rel_url.query.get("username", "")
    return context
