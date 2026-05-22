from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from typing import Any

import aiohttp_jinja2
import aiohttp_session
from aiohttp import web

from login import logout
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from typing_defs import UserDocument, ViewContext
from user_stats import DEFAULT_USER_COUNT
from views import get_user_context
import logging

log = logging.getLogger(__name__)

MAX_EXPORT_ROWS = 20_000
ERASED_MESSAGE_TEXT = "[deleted by account deletion request]"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _export_section(title: str, payload: Any) -> str:
    body = json.dumps(payload, indent=2, sort_keys=True, default=_json_default)
    return f"\n{'=' * len(title)}\n{title}\n{'=' * len(title)}\n{body}\n"


async def _require_logged_in_user(request: web.Request) -> tuple[Any, Any, str | None]:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await app_state.users.get(session_user)
    if user.anon:
        raise web.HTTPFound("/login")
    return app_state, user, session_user


def _clear_public_user_cache(app_state: Any, username: str) -> None:
    public_users = getattr(app_state, "public_users", None)
    if public_users is None:
        return
    profiles = getattr(public_users, "_profiles", None)
    titles = getattr(public_users, "_titles", None)
    if isinstance(profiles, dict):
        profiles.pop(username, None)
    if isinstance(titles, dict):
        titles.pop(username, None)


def _reopen_token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


@aiohttp_jinja2.template("account_data.html")
async def account_personal_data(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/login")
    context["view_css"] = "faq.css"
    return context


async def account_personal_data_export(request: web.Request) -> web.StreamResponse:
    app_state, user, _ = await _require_logged_in_user(request)

    user_doc: UserDocument | None = await app_state.db.user.find_one({"_id": user.username})
    if user_doc is None:
        raise web.HTTPNotFound()

    relations = await app_state.db.relation.find(
        {"$or": [{"u1": user.username}, {"u2": user.username}]}
    ).to_list(MAX_EXPORT_ROWS)
    inbox_threads = await app_state.db.inbox_thread.find({"users": user.username}).to_list(
        MAX_EXPORT_ROWS
    )
    inbox_messages = await app_state.db.inbox_msg.find({"from": user.username}).to_list(
        MAX_EXPORT_ROWS
    )
    created_reports = await app_state.db.user_report.find({"reporter": user.username}).to_list(
        MAX_EXPORT_ROWS
    )
    moderation_reports = await app_state.db.user_report.find({"suspect": user.username}).to_list(
        MAX_EXPORT_ROWS
    )

    metadata = {
        "exportedAt": datetime.now(timezone.utc),
        "username": user.username,
        "note": (
            "This export contains account and private interaction data. "
            "Public game archives are handled separately via the profile PGN export."
        ),
    }

    chunks = [
        _export_section(f"Personal data export for {user.username}", metadata),
        _export_section("Account document", user_doc),
        _export_section("Relations (blocks and related links)", relations),
        _export_section("Inbox threads", inbox_threads),
        _export_section("Inbox messages sent by this account", inbox_messages),
        _export_section("Reports created by this account", created_reports),
        _export_section("Reports where this account is the suspect", moderation_reports),
        _export_section("End of export", {"ok": True}),
    ]
    payload = "\n".join(chunks)

    response = web.Response(text=payload, content_type="text/plain")
    response.headers["Content-Disposition"] = (
        f'attachment; filename="pychess_personal_data_{user.username}.txt"'
    )
    return response


@aiohttp_jinja2.template("account_close.html")
async def account_close(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/login")
    context["view_css"] = "faq.css"
    return context


async def account_close_post(request: web.Request) -> web.StreamResponse:
    app_state, user, _ = await _require_logged_in_user(request)
    post_data = await read_post_data(request)
    if post_data is None:
        return web.Response(status=204)

    confirm_username = str(post_data.get("confirm_username", "")).strip()
    understand = str(post_data.get("understand", "")).strip().lower() in {
        "on",
        "true",
        "1",
        "yes",
    }
    if confirm_username != user.username or not understand:
        raise web.HTTPBadRequest(text="Username confirmation and acknowledgement are required.")

    user_doc: UserDocument | None = await app_state.db.user.find_one(
        {"_id": user.username}, {"reopenedAt": 1}
    )
    close_type = "self_final" if user_doc and user_doc.get("reopenedAt") else "self"

    await app_state.db.user.update_one(
        {"_id": user.username},
        {
            "$set": {
                "enabled": False,
                "closedAt": datetime.now(timezone.utc),
                "closeType": close_type,
            }
        },
    )
    user.enabled = False
    _clear_public_user_cache(app_state, user.username)
    return await logout(request)


@aiohttp_jinja2.template("account_delete.html")
async def account_delete(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/login")
    context["view_css"] = "faq.css"
    return context


async def account_delete_post(request: web.Request) -> web.StreamResponse:
    app_state, user, _ = await _require_logged_in_user(request)
    post_data = await read_post_data(request)
    if post_data is None:
        return web.Response(status=204)

    confirm_username = str(post_data.get("confirm_username", "")).strip()
    understand = str(post_data.get("understand", "")).strip().lower() in {
        "on",
        "true",
        "1",
        "yes",
    }
    if confirm_username != user.username or not understand:
        raise web.HTTPBadRequest(text="Username confirmation and acknowledgement are required.")

    now = datetime.now(timezone.utc)
    await app_state.db.user.update_one(
        {"_id": user.username},
        {
            "$set": {
                "enabled": False,
                "title": "",
                "oauth_id": "",
                "oauth_provider": "",
                "lang": "en",
                "theme": "dark",
                "ct": "all",
                "gdprErasedAt": now,
                "closeType": "deleted",
                "count": dict(DEFAULT_USER_COUNT),
                "perfs": {},
                "pperfs": {},
            },
            "$unset": {"security": ""},
        },
    )
    await app_state.db.relation.delete_many({"$or": [{"u1": user.username}, {"u2": user.username}]})
    await app_state.db.inbox_msg.update_many(
        {"from": user.username},
        {"$set": {"text": ERASED_MESSAGE_TEXT, "erasedBySenderAt": now}},
    )
    _clear_public_user_cache(app_state, user.username)

    user.enabled = False
    user.title = ""
    user.oauth_id = ""
    user.oauth_provider = ""
    user.perfs = {}
    user.pperfs = {}
    user.count = dict(DEFAULT_USER_COUNT)
    user.blocked.clear()

    log.info("Account deleted (GDPR erase) for user %s", user.username)
    return await logout(request)


@aiohttp_jinja2.template("account_reopen.html")
async def account_reopen(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    raw_token = str(request.rel_url.query.get("token") or "").strip()
    if not raw_token:
        raise web.HTTPFound("/login")

    app_state = get_app_state(request.app)
    now = datetime.now(timezone.utc)
    await app_state.db.account_reopen_token.delete_many({"expiresAt": {"$lt": now}})
    token_doc = await app_state.db.account_reopen_token.find_one(
        {
            "tokenHash": _reopen_token_hash(raw_token),
            "usedAt": {"$exists": False},
            "expiresAt": {"$gt": now},
        }
    )
    closed_username = str((token_doc or {}).get("username") or "").strip()
    user_doc: UserDocument | None = (
        await app_state.db.user.find_one({"_id": closed_username}) if closed_username else None
    )

    can_reopen = bool(
        token_doc
        and user_doc
        and (not user_doc.get("enabled", True))
        and user_doc.get("closeType") == "self"
        and (not user_doc.get("gdprErasedAt"))
    )
    context["view_css"] = "faq.css"
    context["reopen_username"] = closed_username
    context["reopen_token"] = raw_token
    context["can_reopen"] = can_reopen
    return context


async def account_reopen_post(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    post_data = await read_post_data(request)
    if post_data is None:
        return web.Response(status=204)

    raw_token = str(post_data.get("token", "")).strip()
    if not raw_token:
        raise web.HTTPBadRequest(text="Missing reopen token.")

    confirm_username = str(post_data.get("confirm_username", "")).strip()
    understand = str(post_data.get("understand", "")).strip().lower() in {
        "on",
        "true",
        "1",
        "yes",
    }
    if not understand:
        raise web.HTTPBadRequest(text="Username confirmation and acknowledgement are required.")

    now = datetime.now(timezone.utc)
    token_hash = _reopen_token_hash(raw_token)
    matching_token = await app_state.db.account_reopen_token.find_one(
        {
            "tokenHash": token_hash,
            "usedAt": {"$exists": False},
            "expiresAt": {"$gt": now},
        }
    )
    if matching_token is None:
        raise web.HTTPForbidden(text="Invalid or expired reopen token.")

    closed_username = str(matching_token.get("username") or "")
    if confirm_username != closed_username:
        raise web.HTTPBadRequest(text="Username confirmation and acknowledgement are required.")

    token_doc = await app_state.db.account_reopen_token.find_one_and_update(
        {
            "tokenHash": token_hash,
            "username": closed_username,
            "usedAt": {"$exists": False},
            "expiresAt": {"$gt": now},
        },
        {"$set": {"usedAt": now}},
    )
    if token_doc is None:
        raise web.HTTPForbidden(text="Invalid or expired reopen token.")

    user_doc: UserDocument | None = await app_state.db.user.find_one({"_id": closed_username})
    if (
        user_doc is None
        or user_doc.get("enabled", True)
        or user_doc.get("closeType") != "self"
        or user_doc.get("gdprErasedAt")
    ):
        raise web.HTTPForbidden(text="This account cannot be reopened automatically.")

    now = datetime.now(timezone.utc)
    await app_state.db.user.update_one(
        {"_id": closed_username},
        {"$set": {"enabled": True, "reopenedAt": now}, "$unset": {"closedAt": "", "closeType": ""}},
    )

    if closed_username in app_state.users:
        cached_user = app_state.users[closed_username]
        cached_user.enabled = True

    _clear_public_user_cache(app_state, closed_username)
    session["user_name"] = closed_username
    session.pop("closed_account_user", None)
    return web.HTTPFound("/")
