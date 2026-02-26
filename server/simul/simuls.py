from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import TYPE_CHECKING

from const import STARTED, T_CREATED, T_FINISHED, T_STARTED, TStatus
from game import Game
from simul.simul import Simul
from typing_defs import SimulDoc, SimulUpdateData
from user import User
from utils import load_game

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)


def _as_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    usernames: list[str] = []
    for item in value:
        if isinstance(item, str) and item not in usernames:
            usernames.append(item)
    return usernames


def _as_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    return None


async def _recover_user(app_state: PychessGlobalAppState, username: str) -> User:
    user = await app_state.users.get(username)
    if user.username == username:
        return user

    recovered = User(app_state, username=username, enabled=False)
    app_state.users[username] = recovered
    return recovered


async def upsert_simul_to_db(simul: Simul, app_state: PychessGlobalAppState | None = None) -> None:
    if app_state is None:
        app_state = simul.app_state

    if app_state.db is None:
        return

    new_data: SimulUpdateData = {
        "name": simul.name,
        "variant": simul.variant,
        "chess960": bool(simul.chess960),
        "rated": bool(simul.rated),
        "base": simul.base,
        "inc": simul.inc,
        "hostColor": simul.host_color,
        "createdBy": simul.created_by,
        "createdAt": simul.created_at,
        "startsAt": simul.starts_at,
        "endsAt": simul.ends_at,
        "status": simul.status,
        "players": list(simul.players.keys()),
        "pendingPlayers": list(simul.pending_players.keys()),
    }

    try:
        await app_state.db.simul.find_one_and_update(
            {"_id": simul.id}, {"$set": new_data}, upsert=True
        )
    except Exception:
        log.exception("Failed to save simul %s", simul.id)


def _parse_status(value: object) -> TStatus:
    if isinstance(value, int):
        try:
            return TStatus(value)
        except ValueError:
            return TStatus(T_CREATED)
    return T_CREATED


def _parse_int(value: object, default: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return default


async def load_simul(
    app_state: PychessGlobalAppState,
    simul_id: str,
    simul_doc: SimulDoc | None = None,
) -> Simul | None:
    if simul_id in app_state.simuls:
        return app_state.simuls[simul_id]

    if app_state.db is None:
        return None

    if simul_doc is None:
        doc = await app_state.db.simul.find_one({"_id": simul_id})
    else:
        doc = simul_doc

    if doc is None:
        return None

    created_by = doc.get("createdBy")
    if not isinstance(created_by, str):
        log.error("Skipping simul %s with invalid creator", simul_id)
        return None

    name = doc.get("name")
    if not isinstance(name, str):
        name = "Simul"

    variant = doc.get("variant")
    if not isinstance(variant, str):
        variant = "chess"

    host_color = doc.get("hostColor")
    if host_color not in ("random", "white", "black"):
        host_color = "random"

    simul = Simul(
        app_state,
        simul_id,
        name=name,
        created_by=created_by,
        variant=variant,
        chess960=bool(doc.get("chess960", False)),
        rated=bool(doc.get("rated", False)),
        base=_parse_int(doc.get("base"), 1),
        inc=_parse_int(doc.get("inc"), 0),
        host_color=host_color,
    )
    simul.created_at = _as_datetime(doc.get("createdAt")) or datetime.now(timezone.utc)
    simul.starts_at = _as_datetime(doc.get("startsAt"))
    simul.ends_at = _as_datetime(doc.get("endsAt"))
    simul.status = _parse_status(doc.get("status"))

    players = _as_str_list(doc.get("players"))
    if created_by not in players:
        players.insert(0, created_by)

    for username in players:
        simul.players[username] = await _recover_user(app_state, username)

    pending_players = _as_str_list(doc.get("pendingPlayers"))
    for username in pending_players:
        if username == created_by or username in simul.players:
            continue
        simul.pending_players[username] = await _recover_user(app_state, username)

    cursor = app_state.db.game.find({"sid": simul_id})
    try:
        cursor.sort("d", 1)
    except AttributeError:
        # unittest mocks may not support sort()
        pass

    async for game_doc in cursor:
        game_id = game_doc.get("_id")
        if not isinstance(game_id, str):
            continue
        loaded_game = await load_game(app_state, game_id)
        if loaded_game is None or not isinstance(loaded_game, Game):
            continue
        game = loaded_game
        simul.games[game_id] = game
        if game.status <= STARTED:
            simul.ongoing_games.add(game)

    if simul.status == T_STARTED and len(simul.games) == 0:
        simul.status = T_CREATED
        simul.starts_at = None
        await upsert_simul_to_db(simul, app_state)

    if simul.status == T_STARTED and len(simul.ongoing_games) == 0 and len(simul.games) > 0:
        simul.status = T_FINISHED
        if simul.ends_at is None:
            simul.ends_at = datetime.now(timezone.utc)
        await upsert_simul_to_db(simul, app_state)

    if simul.status == T_STARTED and len(simul.ongoing_games) > 0:
        simul.clock_task = asyncio.create_task(simul.clock(), name=f"simul-clock-{simul.id}")

    app_state.simuls[simul_id] = simul
    return simul


async def load_active_simuls(app_state: PychessGlobalAppState) -> None:
    if app_state.db is None:
        return

    await app_state.db.simul.create_index("status")
    await app_state.db.simul.create_index("createdAt")

    cursor = app_state.db.simul.find({"status": {"$in": [T_CREATED, T_STARTED]}})
    try:
        cursor.sort("createdAt", -1)
    except AttributeError:
        # unittest mocks may not support sort()
        pass

    async for doc in cursor:
        simul_id = doc.get("_id")
        if not isinstance(simul_id, str):
            continue
        await load_simul(app_state, simul_id, simul_doc=doc)
