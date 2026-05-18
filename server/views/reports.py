from __future__ import annotations

import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from settings import ADMINS
from typing_defs import ViewContext
from views import get_user_context


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


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
    report_docs = await cursor.to_list(length=500)

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
