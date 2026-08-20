from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from const import MAX_CHAT_LINES, STARTED, T_CREATED, T_FINISHED, T_STARTED, TStatus
from game import Game
from startup_timer import StartupTimer
from typing_defs import SimulDoc, SimulUpdateData
from user import User
from utils import load_game
from ws_types import ChatLine

from simul.simul import Simul

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger(__name__)


# Created simuls are cheap to reload on demand from their URL, so startup only
# restores ones whose host was active recently. Started simuls are always
# restored regardless of age. Lichess uses an even tighter live-host window for
# featuring created simuls; one hour is intentionally more forgiving here
# because PyChess records presence on websocket connect rather than periodic
# host pings.
CREATED_SIMUL_RESTART_WINDOW = timedelta(hours=1)


@dataclass
class SimulListEntry:
    id: str
    name: str
    variant: str
    chess960: bool
    base: int
    inc: int
    created_by: str
    starts_at: datetime | None
    estimated_start_at: datetime | None
    status: TStatus
    players_count: int

    @property
    def display_date(self) -> datetime | None:
        if self.status == T_CREATED and self.estimated_start_at is not None:
            return self.estimated_start_at
        return self.starts_at or self.estimated_start_at


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
        "description": simul.description,
        "variant": simul.variant,
        "chess960": bool(simul.chess960),
        "rated": bool(simul.rated),
        "base": simul.base,
        "inc": simul.inc,
        "hostColor": simul.host_color,
        "hostExtraTime": simul.host_extra_time,
        "hostExtraTimePerPlayer": simul.host_extra_time_per_player,
        "entryMinRating": simul.entry_min_rating,
        "entryMaxRating": simul.entry_max_rating,
        "entryMinRatedGames": simul.entry_min_rated_games,
        "entryMinAccountAgeDays": simul.entry_min_account_age_days,
        "createdBy": simul.created_by,
        "createdAt": simul.created_at,
        "hostSeenAt": simul.host_seen_at,
        "startsAt": simul.starts_at,
        "estimatedStartAt": simul.estimated_start_at,
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


async def delete_simul_from_db(
    simul_id: str, app_state: PychessGlobalAppState | None = None
) -> None:
    if app_state is None:
        return

    if app_state.db is None:
        return

    try:
        await app_state.db.simul.delete_one({"_id": simul_id})
        await app_state.db.simul_chat.delete_many({"sid": simul_id})
    except Exception:
        log.exception("Failed to delete simul %s", simul_id)


async def mark_simul_host_seen(simul: Simul) -> None:
    now = datetime.now(UTC)
    simul.host_seen_at = now

    if simul.app_state.db is None:
        return

    try:
        await simul.app_state.db.simul.update_one(
            {"_id": simul.id},
            {"$set": {"hostSeenAt": now}},
        )
    except Exception:
        log.exception("Failed to update host presence for simul %s", simul.id)


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
        description=doc.get("description", "") if isinstance(doc.get("description"), str) else "",
        variant=variant,
        chess960=bool(doc.get("chess960", False)),
        rated=bool(doc.get("rated", False)),
        base=_parse_int(doc.get("base"), 1),
        inc=_parse_int(doc.get("inc"), 0),
        host_color=host_color,
        host_extra_time=_parse_int(doc.get("hostExtraTime"), 0),
        host_extra_time_per_player=_parse_int(doc.get("hostExtraTimePerPlayer"), 0),
        estimated_start_at=_as_datetime(doc.get("estimatedStartAt")),
        entry_min_rating=_parse_int(doc.get("entryMinRating"), 0),
        entry_max_rating=_parse_int(doc.get("entryMaxRating"), 0),
        entry_min_rated_games=_parse_int(doc.get("entryMinRatedGames"), 0),
        entry_min_account_age_days=_parse_int(doc.get("entryMinAccountAgeDays"), 0),
        entry_titled_only=False,
    )
    simul.created_at = _as_datetime(doc.get("createdAt")) or datetime.now(UTC)
    host_seen_at = _as_datetime(doc.get("hostSeenAt"))
    if host_seen_at is None:
        log.error("Skipping simul %s with invalid hostSeenAt", simul_id)
        return None
    simul.host_seen_at = host_seen_at
    simul.starts_at = _as_datetime(doc.get("startsAt"))
    simul.ends_at = _as_datetime(doc.get("endsAt"))
    simul.status = _parse_status(doc.get("status"))

    detail_timer = StartupTimer(log, f"restore simul state {simul_id} details")

    players = _as_str_list(doc.get("players"))
    if created_by not in players:
        players.insert(0, created_by)

    with detail_timer.phase(f"recover {len(players)} simul players"):
        for username in players:
            simul.players[username] = await _recover_user(app_state, username)

    pending_players = _as_str_list(doc.get("pendingPlayers"))
    with detail_timer.phase(f"recover {len(pending_players)} pending players"):
        for username in pending_players:
            if username == created_by or username in simul.players:
                continue
            simul.pending_players[username] = await _recover_user(app_state, username)

    with detail_timer.phase("restore simul games"):
        # Games are only created after a simul transitions from T_CREATED to T_STARTED.
        # Avoid scanning the game collection for a simul that has never started.
        if simul.status != T_CREATED:
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

    with detail_timer.phase("load simul chat"):
        chat_cursor = app_state.db.simul_chat.find(
            {"sid": simul.id},
            projection={
                "_id": 0,
                "type": 1,
                "user": 1,
                "message": 1,
                "room": 1,
                "time": 1,
            },
        )
        docs: list[ChatLine] = await chat_cursor.to_list(length=MAX_CHAT_LINES)
        simul.tourneychat = docs

    with detail_timer.phase("reconcile simul status"):
        if simul.status == T_STARTED and len(simul.games) == 0:
            simul.status = T_CREATED
            simul.starts_at = None
            await upsert_simul_to_db(simul, app_state)

        if simul.status == T_STARTED and len(simul.ongoing_games) == 0 and len(simul.games) > 0:
            simul.status = T_FINISHED
            if simul.ends_at is None:
                simul.ends_at = datetime.now(UTC)
            await upsert_simul_to_db(simul, app_state)

        if simul.status == T_STARTED and len(simul.ongoing_games) > 0:
            simul.clock_task = asyncio.create_task(simul.clock(), name=f"simul-clock-{simul.id}")

    app_state.simuls[simul_id] = simul
    detail_timer.log_summary()
    return simul


async def load_active_simuls(app_state: PychessGlobalAppState) -> None:
    if app_state.db is None:
        return

    startup = StartupTimer(log, "restore active simuls")
    try:
        with startup.phase("ensure status index"):
            await app_state.db.simul.create_index("status")

        with startup.phase("ensure createdAt index"):
            await app_state.db.simul.create_index("createdAt")

        with startup.phase("ensure hostSeenAt index"):
            await app_state.db.simul.create_index("hostSeenAt")

        with startup.phase("query active simul docs"):
            created_cutoff = datetime.now(UTC) - CREATED_SIMUL_RESTART_WINDOW
            cursor = app_state.db.simul.find(
                {
                    "$or": [
                        {"status": T_STARTED},
                        {"status": T_CREATED, "hostSeenAt": {"$gte": created_cutoff}},
                    ]
                }
            )
            try:
                cursor.sort("createdAt", -1)
            except AttributeError:
                # unittest mocks may not support sort()
                pass
            docs = await cursor.to_list(length=None)

        with startup.phase(f"load {len(docs)} active simuls"):
            for doc in docs:
                simul_id = doc.get("_id")
                if not isinstance(simul_id, str):
                    continue
                per_simul = StartupTimer(log, f"restore active simul {simul_id}")
                try:
                    with per_simul.phase("load simul state"):
                        await load_simul(app_state, simul_id, simul_doc=doc)
                finally:
                    per_simul.log_summary()
    finally:
        startup.log_summary()


async def get_latest_simuls(
    app_state: PychessGlobalAppState, limit: int = 30
) -> tuple[list[SimulListEntry], list[SimulListEntry], list[SimulListEntry]]:
    created: list[SimulListEntry] = []
    started: list[SimulListEntry] = []
    finished: list[SimulListEntry] = []

    if app_state.db is None:
        return created, started, finished

    cursor = app_state.db.simul.find()
    try:
        cursor.sort("createdAt", -1)
    except AttributeError:
        pass

    count = 0
    async for doc in cursor:
        simul_doc: SimulDoc = doc
        count += 1
        if count > limit:
            break

        simul_id = simul_doc.get("_id")
        created_by = simul_doc.get("createdBy")
        variant = simul_doc.get("variant")
        name = simul_doc.get("name")
        if (
            not isinstance(simul_id, str)
            or not isinstance(created_by, str)
            or not isinstance(variant, str)
        ):
            continue
        if not isinstance(name, str):
            name = "Simul"

        entry = SimulListEntry(
            id=simul_id,
            name=name,
            variant=variant,
            chess960=bool(simul_doc.get("chess960", False)),
            base=_parse_int(simul_doc.get("base"), 1),
            inc=_parse_int(simul_doc.get("inc"), 0),
            created_by=created_by,
            starts_at=_as_datetime(simul_doc.get("startsAt")),
            estimated_start_at=_as_datetime(simul_doc.get("estimatedStartAt")),
            status=_parse_status(simul_doc.get("status")),
            players_count=len(_as_str_list(simul_doc.get("players"))),
        )

        if entry.status == T_STARTED:
            started.append(entry)
        elif entry.status == T_CREATED:
            created.append(entry)
        else:
            finished.append(entry)

    return created, started, finished
