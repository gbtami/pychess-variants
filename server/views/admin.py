from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

import aiohttp_jinja2
from admin import is_protected_username
from admin_api import MOD_ACTION_LABELS, MOD_LOG_COLLECTION, TEAM_LOG_ACTIONS, USER_LOG_ACTIONS
from admin_ops_api import OPERATION_LOG_ACTIONS, fishnet_key_id
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from report_api import TIMEOUT_REASONS
from security_evasion import BAN_SIGNAL_COLLECTION, signal_ids_from_user_doc
from settings import ADMINS, FISHNET_KEYS
from typing_defs import UserDocument, ViewContext
from variants import VARIANTS

from views import get_user_context

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


async def _admin_context(request: web.Request, section: str, title: str) -> ViewContext:
    user, context = await get_user_context(request)
    if not _is_admin_username(user.username):
        raise web.HTTPForbidden()

    context["title"] = f"{title} • PyChess"
    context["view"] = "admin"
    context["view_css"] = "admin.css"
    context["admin"] = True
    context["admin_section"] = section
    return context


async def _find_user_doc(app_state: Any, raw_username: str) -> UserDocument | None:
    candidate = raw_username.strip().lstrip("@")
    if not USERNAME_RE.fullmatch(candidate):
        return None

    return await app_state.db.user.find_one(
        {
            "$or": [
                {"_id": candidate},
                {
                    "username_lower": {
                        "$eq": candidate.lower(),
                        "$type": "string",
                    }
                },
            ]
        }
    )


def _stored_signal_counts(user_doc: UserDocument) -> dict[str, int]:
    raw_security = user_doc.get("security", {})
    security = raw_security if isinstance(raw_security, dict) else {}

    def count(field: str) -> int:
        values = security.get(field, [])
        return len(values) if isinstance(values, list) else 0

    return {
        "ip": count("ipHashes"),
        "fp": count("fpHashes"),
        "ipfp": count("ipfpHashes"),
    }


async def _active_signal_counts(app_state: Any, user_doc: UserDocument) -> dict[str, int]:
    counts = {"ip": 0, "fp": 0, "ipfp": 0}
    signal_ids = signal_ids_from_user_doc(user_doc)
    if not signal_ids:
        return counts

    collection = getattr(app_state.db, BAN_SIGNAL_COLLECTION)
    cursor = collection.find({"_id": {"$in": signal_ids}}, projection={"kind": 1})
    docs = await cursor.to_list(length=max(3, len(signal_ids)))
    for doc in docs:
        kind = doc.get("kind")
        if isinstance(kind, str) and kind in counts:
            counts[kind] += 1
    return counts


async def _moderation_history(app_state: Any, username: str) -> list[dict[str, object]]:
    collection = getattr(app_state.db, MOD_LOG_COLLECTION)
    cursor = collection.find({"user": username})
    cursor.sort("createdAt", -1)
    cursor.limit(10)
    documents = await cursor.to_list(length=10)
    return [
        {
            "action": str(document.get("action") or ""),
            "action_label": MOD_ACTION_LABELS.get(
                str(document.get("action") or ""),
                str(document.get("action") or "").replace("_", " ").title(),
            ),
            "moderator": str(document.get("mod") or ""),
            "details": str(document.get("details") or ""),
            "created_at": document.get("createdAt"),
        }
        for document in documents
    ]


async def _operations_history(app_state: Any) -> list[dict[str, object]]:
    collection = getattr(app_state.db, MOD_LOG_COLLECTION)
    cursor = collection.find({"action": {"$in": list(OPERATION_LOG_ACTIONS)}})
    cursor.sort("createdAt", -1)
    cursor.limit(15)
    documents = await cursor.to_list(length=15)
    return [
        {
            "action_label": MOD_ACTION_LABELS.get(
                str(document.get("action") or ""),
                str(document.get("action") or "").replace("_", " ").title(),
            ),
            "moderator": str(document.get("mod") or ""),
            "details": str(document.get("details") or ""),
            "created_at": document.get("createdAt"),
        }
        for document in documents
    ]


async def _team_moderation_history(app_state: Any) -> list[dict[str, object]]:
    collection = getattr(app_state.db, MOD_LOG_COLLECTION)
    cursor = collection.find({"action": {"$in": list(TEAM_LOG_ACTIONS)}})
    cursor.sort("createdAt", -1)
    cursor.limit(20)
    documents = await cursor.to_list(length=20)
    return [
        {
            "action_label": MOD_ACTION_LABELS.get(
                str(document.get("action") or ""),
                str(document.get("action") or "").replace("_", " ").title(),
            ),
            "team": str(document.get("team") or ""),
            "moderator": str(document.get("mod") or ""),
            "details": str(document.get("details") or ""),
            "created_at": document.get("createdAt"),
        }
        for document in documents
    ]


async def _user_status(app_state: Any, user_doc: UserDocument) -> dict[str, object]:
    username = str(user_doc["_id"])
    live_user = app_state.users.data.get(username)
    if live_user is not None:
        live_user.update_online()

    raw_count = user_doc.get("count", {})
    count = raw_count if isinstance(raw_count, Mapping) else {}
    raw_security = user_doc.get("security", {})
    security = raw_security if isinstance(raw_security, dict) else {}

    return {
        "username": username,
        "title": str(user_doc.get("title") or ""),
        "enabled": bool(user_doc.get("enabled", True)),
        "shadowban": bool(user_doc.get("shadowban", False)),
        "patron": bool(user_doc.get("patron", False)),
        "protected": is_protected_username(username),
        "online": bool(live_user is not None and live_user.online),
        "timed_out": bool(live_user is not None and live_user.silence > 0),
        "created_at": user_doc.get("createdAt"),
        "games": int(count.get("game", 0) or 0),
        "wins": int(count.get("win", 0) or 0),
        "losses": int(count.get("loss", 0) or 0),
        "draws": int(count.get("draw", 0) or 0),
        "last_auto_close_reason": str(security.get("lastAutoCloseReason") or ""),
        "last_auto_close_at": security.get("lastAutoCloseAt"),
        "stored_signals": _stored_signal_counts(user_doc),
        "active_signals": await _active_signal_counts(app_state, user_doc),
        "moderation_history": await _moderation_history(app_state, username),
    }


@aiohttp_jinja2.template("admin.html")
async def admin(request: web.Request) -> ViewContext:
    return await _admin_context(request, "overview", "Administration")


@aiohttp_jinja2.template("admin_users.html")
async def admin_users(request: web.Request) -> ViewContext:
    context = await _admin_context(request, "users", "User search")
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable()

    query = request.rel_url.query.get("username", "").strip()
    context["admin_user_query"] = query
    context["admin_user_error"] = ""
    context["admin_user_status"] = None
    done = request.rel_url.query.get("done", "")
    context["admin_action_notice"] = (
        MOD_ACTION_LABELS.get(done, "") if done in USER_LOG_ACTIONS else ""
    )
    context["admin_timeout_reasons"] = TIMEOUT_REASONS

    if not query:
        return context

    candidate = query.lstrip("@")
    if not USERNAME_RE.fullmatch(candidate):
        context["admin_user_error"] = "Enter a valid username."
        return context

    user_doc = await _find_user_doc(app_state, candidate)
    if user_doc is None:
        context["admin_user_error"] = "User not found."
        return context

    context["admin_user_status"] = await _user_status(app_state, user_doc)
    return context


@aiohttp_jinja2.template("admin_teams.html")
async def admin_teams(request: web.Request) -> ViewContext:
    context = await _admin_context(request, "teams", "Teams")
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable()

    query_text = request.rel_url.query.get("q", "").strip()[:80]
    status = request.rel_url.query.get("status", "all")
    if status not in {"all", "open", "closed"}:
        status = "all"

    query: dict[str, object] = {}
    if status == "open":
        query["enabled"] = True
    elif status == "closed":
        query["enabled"] = False
    if query_text:
        pattern = {"$regex": re.escape(query_text), "$options": "i"}
        query["$or"] = [{"_id": pattern}, {"name": pattern}, {"createdBy": pattern}]

    teams = await (
        app_state.db.team.find(query)
        .sort([("updatedAt", -1), ("createdAt", -1)])
        .limit(100)
        .to_list(length=100)
    )
    context.update(
        {
            "admin_team_query": query_text,
            "admin_team_status": status,
            "admin_teams": teams,
            "admin_team_history": await _team_moderation_history(app_state),
        }
    )
    return context


@aiohttp_jinja2.template("admin_operations.html")
async def admin_operations(request: web.Request) -> ViewContext:
    context = await _admin_context(request, "operations", "Site operations")
    app_state = get_app_state(request.app)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable()

    done = request.rel_url.query.get("done", "")
    context["admin_action_notice"] = (
        MOD_ACTION_LABELS.get(done, "") if done in OPERATION_LOG_ACTIONS else ""
    )
    context["admin_operations_anons_disabled"] = app_state.disable_new_anons
    context["admin_operations_streams"] = sorted(
        app_state.youtube.live_streams,
        key=lambda stream: str(stream.get("username") or "").casefold(),
    )
    managed_fishnet_docs = await app_state.db.fishnet.find({}, projection={"_id": 1}).to_list(
        length=None
    )
    managed_fishnet_keys = {
        str(document["_id"]) for document in managed_fishnet_docs if "_id" in document
    }
    context["admin_operations_fishnet"] = [
        {
            "id": fishnet_key_id(key),
            "name": name,
            "active": key in app_state.workers,
            "managed": key in managed_fishnet_keys,
            "version": str(app_state.fishnet_versions.get(name) or ""),
        }
        for key, name in sorted(FISHNET_KEYS.items(), key=lambda item: item[1].casefold())
    ]
    display_name = context["variant_display_name"]
    context["admin_operations_variants"] = [
        {"key": variant, "name": display_name(variant)}
        for variant in sorted(VARIANTS, key=lambda item: display_name(item).casefold())
    ]
    context["admin_operations_history"] = await _operations_history(app_state)
    return context
