from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from functools import partial

import aiohttp_session
from aiohttp import web
from aiohttp_sse import sse_response

from newid import new_id
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from utils import notification_items_for_user

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")
MAX_MSG_LEN = 2000
THREAD_MSG_PAGE_SIZE = 100
THREAD_LIST_LIMIT = 80
SSE_GET_TIMEOUT = 30


def _thread_id(user1: str, user2: str) -> str:
    first, second = sorted((user1, user2), key=lambda x: (x.lower(), x))
    return f"{first}:{second}"


def _other_user(users: list[str], me: str) -> str | None:
    for user in users:
        if user != me:
            return user
    return None


async def _session_username(request: web.Request) -> str | None:
    session = await aiohttp_session.get_session(request)
    return session.get("user_name")


async def _unread_count(app_state, username: str) -> int:
    if app_state.db is None:
        return 0
    return await app_state.db.inbox_thread.count_documents(
        {
            "users": username,
            "deletedBy": {"$ne": username},
            "lastMsg.user": {"$ne": username},
            "readBy": {"$ne": username},
        }
    )


async def _push_inbox_state(app_state, username: str, thread_contact: str | None = None) -> None:
    if app_state.db is None:
        return
    user = await app_state.users.get(username)
    unread = await _unread_count(app_state, username)
    payload = json.dumps(
        {
            "unread": unread,
            "thread": thread_contact,
        },
        default=datetime.isoformat,
    )
    for queue in tuple(user.inbox_channels):
        await queue.put(payload)
    notify_payload = json.dumps(
        await notification_items_for_user(app_state, user, 0),
        default=datetime.isoformat,
    )
    for queue in tuple(user.notify_channels):
        await queue.put(notify_payload)


async def inbox_unread(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None:
        return web.json_response({"unread": 0})
    return web.json_response({"unread": await _unread_count(app_state, username)})


async def inbox_threads(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None or app_state.db is None:
        return web.json_response({"threads": []})

    cursor = app_state.db.inbox_thread.find({"users": username, "deletedBy": {"$ne": username}})
    cursor.sort("updatedAt", -1)
    cursor.limit(THREAD_LIST_LIMIT)
    docs = await cursor.to_list(length=THREAD_LIST_LIMIT)

    contacts = [
        contact
        for contact in (_other_user(doc.get("users", []), username) for doc in docs)
        if contact is not None
    ]
    titles = await app_state.public_users.get_titles(contacts)

    threads: list[dict[str, object]] = []
    for doc in docs:
        users = doc.get("users", [])
        contact = _other_user(users, username)
        if contact is None:
            continue
        live_contact = app_state.users.data.get(contact)
        last_msg = doc.get("lastMsg", {})
        read_by = set(doc.get("readBy", []))
        unread = last_msg.get("user") != username and username not in read_by
        threads.append(
            {
                "user": contact,
                "title": titles.get(contact, ""),
                "online": bool(live_contact and live_contact.online),
                "updatedAt": doc.get("updatedAt"),
                "unread": unread,
                "lastMsg": {
                    "user": last_msg.get("user", ""),
                    "text": last_msg.get("text", ""),
                    "createdAt": last_msg.get("createdAt"),
                },
            }
        )

    return web.json_response(
        {"threads": threads},
        dumps=partial(json.dumps, default=datetime.isoformat),
    )


async def inbox_thread(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    contact = request.match_info.get("contact", "")

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    if not USERNAME_RE.match(contact) or contact == username:
        return web.json_response({"type": "error", "message": "Invalid contact"}, status=400)

    me = await app_state.users.get(username)
    if contact in me.blocked:
        return web.json_response({"type": "error", "message": "User is blocked"}, status=403)

    profile = await app_state.public_users.get_profile(contact)
    if profile is None or not profile.enabled or profile.username.startswith("Anon-"):
        return web.json_response({"type": "error", "message": "User not found"}, status=404)
    if username in profile.blocked:
        return web.json_response(
            {"type": "error", "message": "Cannot message this user"}, status=403
        )

    tid = _thread_id(username, contact)
    before = request.rel_url.query.get("before")
    query: dict[str, object] = {"tid": tid, "deletedBy": {"$ne": username}}
    if before is not None:
        try:
            before_dt = datetime.fromtimestamp(int(before) / 1000.0, tz=timezone.utc)
        except ValueError:
            return web.json_response({"type": "error", "message": "Invalid before value"}, status=400)
        query["createdAt"] = {"$lt": before_dt}

    cursor = app_state.db.inbox_msg.find(query)
    cursor.sort("createdAt", -1)
    cursor.limit(THREAD_MSG_PAGE_SIZE)
    msgs_desc = await cursor.to_list(length=THREAD_MSG_PAGE_SIZE)
    msgs = list(reversed(msgs_desc))

    has_more = False
    if msgs:
        oldest_created_at = msgs[0].get("createdAt")
        if isinstance(oldest_created_at, datetime):
            older = await app_state.db.inbox_msg.find_one(
                {
                    "tid": tid,
                    "deletedBy": {"$ne": username},
                    "createdAt": {"$lt": oldest_created_at},
                },
                projection={"_id": 1},
            )
            has_more = older is not None

    update_result = await app_state.db.inbox_thread.update_one(
        {"_id": tid, "lastMsg.user": {"$ne": username}},
        {"$addToSet": {"readBy": username}},
    )
    if update_result.modified_count > 0:
        await _push_inbox_state(app_state, username, contact)

    return web.json_response(
        {
            "contact": {
                "name": profile.username,
                "title": profile.title,
                "online": bool(app_state.users.data.get(profile.username) and app_state.users.data[profile.username].online),
            },
            "messages": msgs,
            "hasMore": has_more,
        },
        dumps=partial(json.dumps, default=datetime.isoformat),
    )


async def inbox_post(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    contact = request.match_info.get("contact", "")

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    if not USERNAME_RE.match(contact) or contact == username:
        return web.json_response({"type": "error", "message": "Invalid contact"}, status=400)

    data = await read_post_data(request)
    if data is None:
        return web.json_response({"type": "error", "message": "Invalid request"}, status=400)

    text = str(data.get("text") or "").strip()
    if len(text) == 0:
        return web.json_response({"type": "error", "message": "Message is empty"}, status=400)
    if len(text) > MAX_MSG_LEN:
        return web.json_response(
            {"type": "error", "message": f"Message too long (max {MAX_MSG_LEN})"},
            status=400,
        )

    me = await app_state.users.get(username)
    if contact in me.blocked:
        return web.json_response({"type": "error", "message": "User is blocked"}, status=403)

    profile = await app_state.public_users.get_profile(contact)
    if profile is None or not profile.enabled or profile.username.startswith("Anon-"):
        return web.json_response({"type": "error", "message": "User not found"}, status=404)
    if username in profile.blocked:
        return web.json_response(
            {"type": "error", "message": "Cannot message this user"}, status=403
        )

    now = datetime.now(timezone.utc)
    tid = _thread_id(username, contact)

    msg_id = await new_id(app_state.db.inbox_msg)
    msg_doc = {
        "_id": msg_id,
        "tid": tid,
        "from": username,
        "to": contact,
        "text": text,
        "createdAt": now,
    }

    await app_state.db.inbox_msg.insert_one(msg_doc)
    await app_state.db.inbox_thread.update_one(
        {"_id": tid},
        {
            "$set": {
                "users": [username, contact],
                "updatedAt": now,
                "lastMsg": {
                    "user": username,
                    "text": text,
                    "createdAt": now,
                },
                "readBy": [username],
            },
            "$pull": {"deletedBy": {"$in": [username, contact]}},
        },
        upsert=True,
    )

    await _push_inbox_state(app_state, username, contact)
    await _push_inbox_state(app_state, contact, username)

    return web.json_response(
        {"ok": True, "message": msg_doc},
        dumps=partial(json.dumps, default=datetime.isoformat),
    )


async def inbox_read(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    contact = request.match_info.get("contact", "")

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    if not USERNAME_RE.match(contact) or contact == username:
        return web.json_response({"type": "error", "message": "Invalid contact"}, status=400)

    tid = _thread_id(username, contact)
    update_result = await app_state.db.inbox_thread.update_one(
        {"_id": tid, "lastMsg.user": {"$ne": username}},
        {"$addToSet": {"readBy": username}},
    )
    if update_result.modified_count > 0:
        await _push_inbox_state(app_state, username, contact)
    return web.json_response({"ok": True})


async def inbox_delete(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    contact = request.match_info.get("contact", "")

    if username is None or app_state.db is None:
        return web.json_response({"type": "error", "message": "Login required"}, status=401)

    if not USERNAME_RE.match(contact) or contact == username:
        return web.json_response({"type": "error", "message": "Invalid contact"}, status=400)

    tid = _thread_id(username, contact)
    await app_state.db.inbox_msg.update_many({"tid": tid}, {"$addToSet": {"deletedBy": username}})
    await app_state.db.inbox_thread.update_one(
        {"_id": tid},
        {"$addToSet": {"deletedBy": username}},
    )
    await _push_inbox_state(app_state, username, contact)
    return web.json_response({"ok": True})


async def subscribe_inbox(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    username = await _session_username(request)
    if username is None:
        return web.json_response({})

    user = await app_state.users.get(username)
    queue: asyncio.Queue[str] = asyncio.Queue()
    user.inbox_channels.add(queue)
    response: web.StreamResponse = web.Response(status=200)

    try:
        async with sse_response(request) as response:
            await response.send(json.dumps({"unread": await _unread_count(app_state, username)}))
            while response.is_connected():
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_GET_TIMEOUT)
                    await response.send(payload)
                    queue.task_done()
                except asyncio.TimeoutError:
                    if not response.is_connected():
                        break
    except Exception:
        pass
    finally:
        user.inbox_channels.discard(queue)

    return response
