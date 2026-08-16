from __future__ import annotations

import collections
import logging
import re
from collections.abc import Mapping
from typing import TYPE_CHECKING

from const import T_CREATED, T_STARTED, reserved
from login import logout
from security_evasion import (
    add_ban_signals_from_user,
    remove_ban_signals_from_user,
)
from settings import ADMINS

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from ws_types import ChatLine, FullChatMessage

log = logging.getLogger(__name__)


def _resolve_online_username(users: Mapping[str, object], raw_username: str) -> str | None:
    candidate = raw_username.lstrip("@")
    if candidate in users:
        return candidate

    lowered = candidate.casefold()
    for username in users:
        if username.casefold() == lowered:
            return username

    return None


def _normalize_target_username(raw_username: str) -> str:
    return raw_username.lstrip("@")


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def is_protected_username(username: str) -> bool:
    return _is_admin_username(username) or reserved(username)


async def resolve_existing_username(
    app_state: PychessGlobalAppState, raw_username: str
) -> str | None:
    candidate = _normalize_target_username(raw_username)

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


async def set_shadowban(
    app_state: PychessGlobalAppState,
    raw_username: str,
    enabled: bool,
) -> bool:
    username = _normalize_target_username(raw_username)
    if is_protected_username(username):
        return False

    resolved_username = await resolve_existing_username(app_state, username)
    if resolved_username is None:
        return False
    username = resolved_username

    await app_state.db.user.find_one_and_update(
        {"_id": username},
        {"$set": {"shadowban": enabled}},
    )
    if username in app_state.users:
        user = await app_state.users.get(username)
        user.shadowban = enabled

    return True


def silence(
    app_state: PychessGlobalAppState,
    raw_username: str,
    chat: collections.deque[ChatLine] | list[ChatLine] | None = None,
    reason_text: str = "spamming the chat",
) -> FullChatMessage | None:
    response: FullChatMessage | None = None
    spammer = _resolve_online_username(app_state.users, raw_username)
    if spammer is not None and is_protected_username(spammer):
        return None
    if spammer is not None:
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
                "message": "%s was timed out 15 minutes for %s." % (spammer, reason_text),
            }
        )
        response = {"type": "fullchat", "lines": list(chat_lines)}
    return response


async def ban(app_state: PychessGlobalAppState, raw_username: str) -> bool:
    username = _normalize_target_username(raw_username)
    if is_protected_username(username):
        return False

    resolved_username = await resolve_existing_username(app_state, username)
    if resolved_username is None:
        return False

    username = resolved_username

    await app_state.db.user.find_one_and_update({"_id": username}, {"$set": {"enabled": False}})
    banned_user = None
    if username in app_state.users:
        banned_user = await app_state.users.get(username)
        banned_user.enabled = False

    # Keep started tournament history intact but ensure banned users are not
    # paired again. For not-yet-started tournaments, remove them from entries.
    for tournament in tuple(app_state.tournaments.values()):
        player = tournament.get_player_by_name(username)
        if player is None:
            continue
        if tournament.status == T_CREATED:
            await tournament.withdraw(player)
        elif tournament.status == T_STARTED:
            await tournament.pause(player)

    if banned_user is not None:
        await logout(None, banned_user)

    signal_count = await add_ban_signals_from_user(app_state.db, username)
    if signal_count > 0:
        log.info("Stored %s ban-evasion signal(s) for %s", signal_count, username)
    return True


async def unban(app_state: PychessGlobalAppState, raw_username: str) -> bool:
    username = _normalize_target_username(raw_username)
    if is_protected_username(username):
        return False

    resolved_username = await resolve_existing_username(app_state, username)
    if resolved_username is None:
        return False

    username = resolved_username

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
    return True
