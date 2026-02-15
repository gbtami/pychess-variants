from __future__ import annotations
from typing import TYPE_CHECKING, Deque
import collections
import logging

from broadcast import broadcast_streams
from const import NONE_USER
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from login import logout
from newid import new_id
from security_evasion import (
    BAN_SIGNAL_COLLECTION,
    add_ban_signals_from_user,
    remove_ban_signals_from_user,
    signal_ids_from_user_doc,
)
from settings import ADMINS, FISHNET_KEYS
from variants import VARIANTS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from ws_types import ChatLine, FullChatMessage, LobbyChatMessage

log = logging.getLogger(__name__)


def silence(
    app_state: PychessGlobalAppState,
    message: str,
    chat: Deque["ChatLine"] | list["ChatLine"] | None = None,
) -> FullChatMessage | None:
    response: FullChatMessage | None = None
    spammer = message.split()[-1]
    if spammer in app_state.users:
        chat_lines = app_state.lobby.lobbychat if chat is None else chat
        users = app_state.users

        users[spammer].set_silence()

        if isinstance(chat_lines, collections.deque):
            kept_lines = [line for line in chat_lines if line["user"] != spammer]
            chat_lines.clear()
            chat_lines.extend(kept_lines)
        else:
            chat_lines[:] = [line for line in chat_lines if line["user"] != spammer]

        chat_lines.append(
            {
                "type": "lobbychat",
                "user": "",
                "message": "%s was timed out 10 minutes for spamming the chat." % spammer,
            }
        )
        response = {"type": "fullchat", "lines": list(chat_lines)}
    return response


def disable_new_anons(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) > 1:
        app_state.disable_new_anons = parts[1].lower() in ("1", "true", "yes")


async def stream(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) >= 3:
        if parts[1] == "add":
            if len(parts) >= 5:
                app_state.youtube.add(parts[2], parts[3], parts[4])
            elif len(parts) >= 4:
                app_state.youtube.add(parts[2], parts[3])
            else:
                app_state.youtube.add(parts[2])
        elif parts[1] == "remove":
            app_state.youtube.remove(parts[2])
        await broadcast_streams(app_state)


async def delete_puzzle(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) == 2 and len(parts[1]) == 5:
        await app_state.db.puzzle.delete_one({"_id": parts[1]})


async def ban(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) != 2:
        return

    username = parts[1]
    if username in ADMINS:
        return

    user_doc = await app_state.db.user.find_one({"_id": username}, projection={"_id": 1})
    if user_doc is None:
        return

    await app_state.db.user.find_one_and_update({"_id": username}, {"$set": {"enabled": False}})
    if username in app_state.users:
        banned_user = await app_state.users.get(username)
        banned_user.enabled = False
        await logout(None, banned_user)

    signal_count = await add_ban_signals_from_user(app_state.db, username)
    if signal_count > 0:
        log.info("Stored %s ban-evasion signal(s) for %s", signal_count, username)


async def unban(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) != 2:
        return

    username = parts[1]
    if username in ADMINS:
        return

    user_doc = await app_state.db.user.find_one({"_id": username}, projection={"_id": 1})
    if user_doc is None:
        return

    await app_state.db.user.find_one_and_update({"_id": username}, {"$set": {"enabled": True}})
    if username in app_state.users:
        user = await app_state.users.get(username)
        user.enabled = True

    touched_count, deleted_count = await remove_ban_signals_from_user(app_state.db, username)
    if touched_count > 0:
        log.info(
            "Unban %s removed source from %s signal(s), deleted %s empty signal(s)",
            username,
            touched_count,
            deleted_count,
        )


async def baninfo(app_state: PychessGlobalAppState, message: str) -> LobbyChatMessage:
    parts = message.split()
    if len(parts) != 2:
        return {
            "type": "lobbychat",
            "user": "server",
            "message": "Usage: /baninfo <username>",
        }

    username = parts[1]
    user_doc = await app_state.db.user.find_one(
        {"_id": username}, projection={"enabled": 1, "security": 1}
    )
    if user_doc is None:
        return {
            "type": "lobbychat",
            "user": "server",
            "message": "baninfo: user not found",
        }

    security = user_doc.get("security", {})
    if not isinstance(security, dict):
        security = {}

    def as_count(field: str) -> int:
        values = security.get(field, [])
        return len(values) if isinstance(values, list) else 0

    stored_counts = {
        "ip": as_count("ipHashes"),
        "fp": as_count("fpHashes"),
        "ipfp": as_count("ipfpHashes"),
    }
    active_counts = {"ip": 0, "fp": 0, "ipfp": 0}
    signal_ids = signal_ids_from_user_doc(user_doc)
    if signal_ids:
        collection = getattr(app_state.db, BAN_SIGNAL_COLLECTION)
        cursor = collection.find({"_id": {"$in": signal_ids}}, projection={"kind": 1})
        docs = await cursor.to_list(length=max(3, len(signal_ids)))
        for doc in docs:
            kind = doc.get("kind")
            if isinstance(kind, str) and kind in active_counts:
                active_counts[kind] += 1

    enabled = user_doc.get("enabled", True)
    last_reason = security.get("lastAutoCloseReason", "-")
    last_at = security.get("lastAutoCloseAt")
    last_at_str = last_at.isoformat() if hasattr(last_at, "isoformat") else "-"

    info = (
        f"baninfo {username}: enabled={enabled} "
        f"autoClose={last_reason} at={last_at_str} "
        f"stored(ip={stored_counts['ip']},fp={stored_counts['fp']},ipfp={stored_counts['ipfp']}) "
        f"active(ip={active_counts['ip']},fp={active_counts['fp']},ipfp={active_counts['ipfp']})"
    )
    return {"type": "lobbychat", "user": "server", "message": info}


async def crosstable(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    log.debug("parts: %r", parts)
    if len(parts) == 2:
        user = await app_state.users.get(parts[1])
        if user.username != NONE_USER:
            await generate_crosstable(app_state, user.username)


async def highscore(app_state: PychessGlobalAppState, message: str) -> None:
    parts = message.split()
    if len(parts) == 2 and parts[1] in VARIANTS:
        variant = parts[1]
        await generate_highscore(app_state, variant)


async def fishnet(app_state: PychessGlobalAppState, message: str) -> LobbyChatMessage | None:
    parts = message.split()
    if len(parts) == 3:
        if parts[1] == "add":
            key = await new_id(app_state.db.fishnet)
            name = parts[2]
            await app_state.db.fishnet.find_one_and_update(
                {"_id": key},
                {"$set": {"name": name}},
                upsert=True,
            )
            FISHNET_KEYS[key] = name
            app_state.fishnet_monitor[name] = collections.deque([], 50)
            response: LobbyChatMessage = {
                "type": "lobbychat",
                "user": "server",
                "message": "name: %s key: %s" % (name, key),
            }
            return response

        elif parts[1] == "remove":
            key = parts[2]
            if key in FISHNET_KEYS:
                name = FISHNET_KEYS[key]
                await app_state.db.fishnet.delete_one({"_id": key})
                del FISHNET_KEYS[key]
                del app_state.fishnet_monitor[name]
                app_state.workers.remove(key)
    return None
