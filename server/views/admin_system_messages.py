from __future__ import annotations

from typing import Any

import aiohttp_jinja2
from admin_api import MOD_LOG_COLLECTION
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from settings import ADMINS
from system_messages_api import SYSTEM_MESSAGE_ACTIVE_DAYS, SYSTEM_MESSAGE_LOG_ACTION
from typing_defs import ViewContext

from views import get_user_context


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


async def _system_message_history(app_state: Any) -> list[dict[str, object]]:
    collection = getattr(app_state.db, MOD_LOG_COLLECTION)
    cursor = collection.find({"action": SYSTEM_MESSAGE_LOG_ACTION})
    cursor.sort("createdAt", -1)
    cursor.limit(15)
    documents = await cursor.to_list(length=15)
    return [
        {
            "moderator": str(document.get("mod") or ""),
            "details": str(document.get("details") or ""),
            "created_at": document.get("createdAt"),
        }
        for document in documents
    ]


@aiohttp_jinja2.template("admin_system_messages.html")
async def admin_system_messages(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if not _is_admin_username(user.username):
        raise web.HTTPForbidden()

    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable()

    context["title"] = "System messages • PyChess"
    context["view"] = "admin"
    context["view_css"] = "admin.css"
    context["admin"] = True
    context["admin_section"] = "system-messages"
    context["admin_system_message_active_days"] = SYSTEM_MESSAGE_ACTIVE_DAYS
    context["admin_system_message_history"] = await _system_message_history(app_state)
    return context
