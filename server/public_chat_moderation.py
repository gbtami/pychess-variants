from __future__ import annotations

import collections
from collections.abc import MutableSequence
from typing import TYPE_CHECKING, Any

from admin import timeout_user
from broadcast import round_broadcast

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from ws_types import ChatLine, FullChatMessage


def _delete_user_lines(
    chat: collections.deque[ChatLine] | MutableSequence[ChatLine], username: str
) -> bool:
    kept = [line for line in chat if line.get("user") != username]
    if len(kept) == len(chat):
        return False

    if isinstance(chat, collections.deque):
        chat.clear()
        chat.extend(kept)
    else:
        chat[:] = kept
    return True


def _full_chat(chat: collections.deque[ChatLine] | MutableSequence[ChatLine]) -> FullChatMessage:
    return {"type": "fullchat", "lines": list(chat)}


def _system_line(chan: str, username: str, reason_text: str) -> ChatLine:
    line: ChatLine = {
        "type": "roundchat" if chan == "round" else "lobbychat",
        "user": "",
        "message": f"{username} was timed out 15 minutes for {reason_text}.",
    }
    if chan == "round":
        line["room"] = "player"
    return line


def _unique_rooms(rooms: list[Any]) -> list[Any]:
    result: list[Any] = []
    seen: set[int] = set()
    for room in rooms:
        marker = id(room)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(room)
    return result


async def timeout_public_chat_user(
    app_state: PychessGlobalAppState,
    raw_username: str,
    *,
    source_chan: str | None = None,
    source_room_id: str | None = None,
    source_room: Any | None = None,
    reason_text: str = "spamming the chat",
) -> str | None:
    """Apply a global public-chat timeout and remove the user's visible public chat lines.

    The timeout is persisted by ``timeout_user``. Chat deletion mirrors lichess's
    global timeout behavior: all currently loaded public chats are cleaned and
    broadcast immediately, while tournament/simul deletions are persisted too.
    Only the room where the moderator acted gets the timeout system line.
    """

    username = await timeout_user(app_state, raw_username)
    if username is None:
        return None

    tournaments = list(getattr(app_state, "tournaments", {}).values())
    simuls = list(getattr(app_state, "simuls", {}).values())
    games: list[Any] = []

    if source_room is not None:
        if source_chan == "tournament":
            tournaments.append(source_room)
        elif source_chan == "simul":
            simuls.append(source_room)
        elif source_chan == "round":
            # Round/player chat is not part of the global public-chat sweep.
            # Clean only the room where the moderator acted.
            games.append(source_room)

    tournaments = _unique_rooms(tournaments)
    simuls = _unique_rooms(simuls)
    games = _unique_rooms(games)

    changed_tournaments: list[Any] = []
    changed_simuls: list[Any] = []
    changed_games: list[Any] = []
    source_notice: ChatLine | None = None

    for tournament in tournaments:
        chat = getattr(tournament, "tourneychat", None)
        if chat is None:
            continue
        changed = _delete_user_lines(chat, username)
        room_id = str(getattr(tournament, "id", ""))
        is_source = source_chan == "tournament" and (
            tournament is source_room or (source_room_id is not None and room_id == source_room_id)
        )
        if is_source:
            source_notice = _system_line("tournament", username, reason_text)
            chat.append(source_notice)
            changed = True
        if changed:
            changed_tournaments.append(tournament)

    for simul in simuls:
        chat = getattr(simul, "tourneychat", None)
        if chat is None:
            continue
        changed = _delete_user_lines(chat, username)
        room_id = str(getattr(simul, "id", ""))
        is_source = source_chan == "simul" and (
            simul is source_room or (source_room_id is not None and room_id == source_room_id)
        )
        if is_source:
            source_notice = _system_line("simul", username, reason_text)
            chat.append(source_notice)
            changed = True
        if changed:
            changed_simuls.append(simul)

    for game in games:
        chat = getattr(game, "messages", None)
        if chat is None:
            continue
        changed = _delete_user_lines(chat, username)
        room_id = str(getattr(game, "id", ""))
        is_source = source_chan == "round" and (
            game is source_room or (source_room_id is not None and room_id == source_room_id)
        )
        if is_source:
            source_notice = _system_line("round", username, reason_text)
            chat.append(source_notice)
            changed = True
        if changed:
            changed_games.append(game)

    db = getattr(app_state, "db", None)
    if db is not None:
        tournament_ids = {
            str(getattr(tournament, "id", ""))
            for tournament in tournaments
            if getattr(tournament, "id", None)
        }
        if source_chan == "tournament" and source_room_id:
            tournament_ids.add(source_room_id)
        if tournament_ids:
            await db.tournament_chat.delete_many(
                {"tid": {"$in": list(tournament_ids)}, "user": username}
            )

        simul_ids = {
            str(getattr(simul, "id", "")) for simul in simuls if getattr(simul, "id", None)
        }
        if source_chan == "simul" and source_room_id:
            simul_ids.add(source_room_id)
        if simul_ids:
            await db.simul_chat.delete_many({"sid": {"$in": list(simul_ids)}, "user": username})

        if source_notice is not None and source_room_id is not None:
            if source_chan == "tournament":
                await db.tournament_chat.insert_one({**source_notice, "tid": source_room_id})
            elif source_chan == "simul":
                await db.simul_chat.insert_one({**source_notice, "sid": source_room_id})

    for tournament in changed_tournaments:
        await tournament.broadcast(_full_chat(tournament.tourneychat))
    for simul in changed_simuls:
        await simul.broadcast(_full_chat(simul.tourneychat))
    for game in changed_games:
        await round_broadcast(game, _full_chat(game.messages), full=True)

    return username
