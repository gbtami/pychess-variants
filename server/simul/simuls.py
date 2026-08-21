from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from compress import C2R
from const import MAX_CHAT_LINES, STARTED, T_CREATED, T_FINISHED, T_STARTED, TStatus
from fairy import FairyBoard
from game import Game
from typing_defs import SimulDoc, SimulParticipantDoc, SimulUpdateData
from user import User
from utils import load_game, sanitize_fen
from variants import get_server_variant
from ws_types import ChatLine

from simul.simul import SIMUL_ERASED_USER, Simul, split_simul_variant_key

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
SIMUL_HOME_CREATED_LIMIT = 50
SIMUL_HOME_STARTED_LIMIT = 50
SIMUL_HOME_FINISHED_LIMIT = 20
SIMUL_HOME_MINE_LIMIT = 50
SIMUL_HISTORY_PAGE_SIZE = 20


@dataclass
class SimulListEntry:
    id: str
    name: str
    variants: list[str]
    icon: str
    base: int
    inc: int
    created_by: str
    created_at: datetime | None
    starts_at: datetime | None
    estimated_start_at: datetime | None
    status: TStatus
    players_count: int
    participation: str | None = None
    wins: int = 0
    draws: int = 0
    losses: int = 0

    @property
    def display_date(self) -> datetime | None:
        if self.status == T_CREATED and self.estimated_start_at is not None:
            return self.estimated_start_at
        return self.starts_at or self.estimated_start_at


def _as_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _as_simul_participants(value: object) -> list[SimulParticipantDoc]:
    if not isinstance(value, list):
        return []
    participants: list[SimulParticipantDoc] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        username = item.get("user")
        variant = item.get("variant")
        host = item.get("host")
        if isinstance(username, str) and isinstance(variant, str) and isinstance(host, bool):
            participants.append({"user": username, "variant": variant, "host": host})
    return participants


def _simul_player_key(players: dict[str, User], username: str) -> str:
    if username not in players:
        return username
    if username != SIMUL_ERASED_USER:
        return username

    suffix = 2
    while f"{SIMUL_ERASED_USER}:{suffix}" in players:
        suffix += 1
    return f"{SIMUL_ERASED_USER}:{suffix}"


def _erased_simul_user(app_state: PychessGlobalAppState) -> User:
    return User(app_state, username=SIMUL_ERASED_USER, enabled=False)


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
        "fen": simul.fen,
        "variants": list(simul.variants),
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
        "entryTeamId": simul.entry_team_id,
        "entryTeamName": simul.entry_team_name,
        "featurable": simul.featurable,
        "createdBy": simul.created_by,
        "createdAt": simul.created_at,
        "hostSeenAt": simul.host_seen_at,
        "startsAt": simul.starts_at,
        "estimatedStartAt": simul.estimated_start_at,
        "endsAt": simul.ends_at,
        "status": simul.status,
        "hostGameId": simul.host_game_id,
        "players": [
            {
                "user": player.username,
                "variant": simul.player_variants.get(key, simul.primary_variant_key),
                "host": key == simul.created_by,
            }
            for key, player in simul.players.items()
        ],
        "pendingPlayers": [
            {
                "user": player.username,
                "variant": simul.pending_player_variants.get(key, simul.primary_variant_key),
                "host": False,
            }
            for key, player in simul.pending_players.items()
        ],
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


def _anonymize_loaded_simul_player(
    app_state: PychessGlobalAppState, simul: Simul, username: str, *, host: bool
) -> None:
    player = simul.players.pop(username, None)
    variant_key = simul.player_variants.pop(username, None)
    simul.pending_players.pop(username, None)
    simul.pending_player_variants.pop(username, None)
    if player is None:
        return

    if host:
        existing = simul.players.pop(SIMUL_ERASED_USER, None)
        existing_variant = simul.player_variants.pop(SIMUL_ERASED_USER, None)
        if existing is not None:
            suffix = 2
            while f"{SIMUL_ERASED_USER}:{suffix}" in simul.players:
                suffix += 1
            shifted_key = f"{SIMUL_ERASED_USER}:{suffix}"
            simul.players[shifted_key] = existing
            simul.player_variants[shifted_key] = existing_variant or simul.primary_variant_key
        key = SIMUL_ERASED_USER
    else:
        key = _simul_player_key(simul.players, SIMUL_ERASED_USER)
    simul.players[key] = _erased_simul_user(app_state)
    simul.player_variants[key] = variant_key or simul.primary_variant_key


async def erase_user_from_simuls(app_state: PychessGlobalAppState, username: str) -> None:
    """Remove personal simul references while preserving played simul history.

    Created simuls owned by the erased account have no game history and can no
    longer be hosted, so delete them. Created-simul applicants are removed. For
    started/finished simuls, keep the historical participant slots but replace
    usernames with the same non-identifying marker used elsewhere on PyChess.
    """
    if app_state.db is None:
        return

    cursor = app_state.db.simul.find(
        {
            "$or": [
                {"createdBy": username},
                {"players.user": username},
                {"pendingPlayers.user": username},
            ]
        }
    )
    docs = await cursor.to_list(length=None)

    for doc in docs:
        simul_id = doc.get("_id")
        if not isinstance(simul_id, str):
            continue

        status = _parse_status(doc.get("status"))
        is_host = doc.get("createdBy") == username
        if is_host and status == T_CREATED:
            await delete_simul_from_db(simul_id, app_state)
            app_state.simuls.pop(simul_id, None)
            continue

        players = _as_simul_participants(doc.get("players"))
        pending_players = _as_simul_participants(doc.get("pendingPlayers"))
        update: dict[str, object] = {}

        if is_host:
            update["createdBy"] = SIMUL_ERASED_USER

        if status == T_CREATED:
            update["players"] = [player for player in players if player["user"] != username]
            update["pendingPlayers"] = [
                player for player in pending_players if player["user"] != username
            ]
        else:
            update["players"] = [
                {**player, "user": SIMUL_ERASED_USER} if player["user"] == username else player
                for player in players
            ]
            update["pendingPlayers"] = [
                {**player, "user": SIMUL_ERASED_USER} if player["user"] == username else player
                for player in pending_players
            ]

        await app_state.db.simul.update_one({"_id": simul_id}, {"$set": update})

        simul = app_state.simuls.get(simul_id)
        if simul is None:
            continue
        simul.spectators = {
            spectator for spectator in simul.spectators if spectator.username != username
        }
        if is_host:
            simul.created_by = SIMUL_ERASED_USER
        if status == T_CREATED:
            simul.players.pop(username, None)
            simul.player_variants.pop(username, None)
            simul.pending_players.pop(username, None)
            simul.pending_player_variants.pop(username, None)
        else:
            _anonymize_loaded_simul_player(app_state, simul, username, host=is_host)


async def set_simul_host_game(simul: Simul, game_id: str) -> None:
    """Record and announce which live simul board the host is viewing."""
    if simul.status != T_STARTED or game_id not in simul.games or simul.host_game_id == game_id:
        return

    simul.host_game_id = game_id
    if simul.app_state.db is not None:
        try:
            await simul.app_state.db.simul.update_one(
                {"_id": simul.id},
                {"$set": {"hostGameId": game_id}},
            )
        except Exception:
            log.exception("Failed to update current host game for simul %s", simul.id)

    await simul.broadcast({"type": "host_game", "gameId": game_id})


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

    raw_variants = doc.get("variants")
    variants = _as_str_list(raw_variants)
    if (
        not isinstance(raw_variants, list)
        or not variants
        or len(variants) != len(raw_variants)
        or len(variants) != len(set(variants))
    ):
        log.error("Skipping simul %s with invalid variants", simul_id)
        return None

    fen = doc.get("fen")
    if not isinstance(fen, str):
        log.error("Skipping simul %s with invalid starting position", simul_id)
        return None
    if fen and len(variants) != 1:
        log.error("Skipping simul %s with a starting position and multiple variants", simul_id)
        return None
    if fen:
        variant, chess960 = split_simul_variant_key(variants[0])
        fen_valid, sanitized_fen = sanitize_fen(variant, fen, chess960)
        if not fen_valid or not FairyBoard(variant, sanitized_fen, chess960).has_legal_move():
            log.error("Skipping simul %s with an invalid persisted starting position", simul_id)
            return None
        fen = sanitized_fen

    host_color = doc.get("hostColor")
    if host_color not in ("random", "white", "black"):
        host_color = "random"

    featurable = doc.get("featurable")
    if not isinstance(featurable, bool):
        log.error("Skipping simul %s with invalid featurable flag", simul_id)
        return None

    try:
        simul = Simul(
            app_state,
            simul_id,
            name=name,
            created_by=created_by,
            description=(
                doc.get("description", "") if isinstance(doc.get("description"), str) else ""
            ),
            fen=fen,
            variants=variants,
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
            entry_team_id=(
                doc.get("entryTeamId") if isinstance(doc.get("entryTeamId"), str) else None
            ),
            entry_team_name=(
                doc.get("entryTeamName") if isinstance(doc.get("entryTeamName"), str) else None
            ),
            featurable=featurable,
        )
    except ValueError as exc:
        log.error("Skipping simul %s with invalid variants: %s", simul_id, exc)
        return None
    simul.created_at = _as_datetime(doc.get("createdAt")) or datetime.now(UTC)
    host_seen_at = _as_datetime(doc.get("hostSeenAt"))
    if host_seen_at is None:
        log.error("Skipping simul %s with invalid hostSeenAt", simul_id)
        return None
    simul.host_seen_at = host_seen_at
    simul.starts_at = _as_datetime(doc.get("startsAt"))
    simul.ends_at = _as_datetime(doc.get("endsAt"))
    simul.status = _parse_status(doc.get("status"))
    host_game_id = doc.get("hostGameId")
    if host_game_id is not None and not isinstance(host_game_id, str):
        log.error("Skipping simul %s with invalid hostGameId", simul_id)
        return None
    simul.host_game_id = host_game_id

    raw_players = doc.get("players")
    players = _as_simul_participants(raw_players)
    if not isinstance(raw_players, list) or len(players) != len(raw_players):
        log.error("Skipping simul %s with invalid persisted participants", simul_id)
        return None
    host_entries = [player for player in players if player["host"]]
    if len(host_entries) != 1 or host_entries[0]["user"] != created_by:
        log.error("Skipping simul %s with invalid persisted host participant", simul_id)
        return None
    if any(player["variant"] not in variants for player in players):
        log.error("Skipping simul %s with invalid persisted player variant", simul_id)
        return None

    host_entry = host_entries[0]
    ordered_players = [host_entry, *(player for player in players if player is not host_entry)]
    for participant in ordered_players:
        username = participant["user"]
        if participant["host"]:
            key = created_by
        else:
            key = _simul_player_key(simul.players, username)
        if username == SIMUL_ERASED_USER:
            simul.players[key] = _erased_simul_user(app_state)
        else:
            simul.players[key] = await _recover_user(app_state, username)
        simul.player_variants[key] = participant["variant"]

    raw_pending_players = doc.get("pendingPlayers")
    pending_players = _as_simul_participants(raw_pending_players)
    if (
        not isinstance(raw_pending_players, list)
        or len(pending_players) != len(raw_pending_players)
        or any(player["host"] or player["variant"] not in variants for player in pending_players)
    ):
        log.error("Skipping simul %s with invalid persisted pending participant", simul_id)
        return None
    for participant in pending_players:
        username = participant["user"]
        if username == created_by or username in simul.players:
            continue
        simul.pending_players[username] = await _recover_user(app_state, username)
        simul.pending_player_variants[username] = participant["variant"]

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

    if simul.host_game_id is not None and simul.host_game_id not in simul.games:
        log.warning("Clearing stale host game %s from simul %s", simul.host_game_id, simul.id)
        simul.host_game_id = None

    if simul.status == T_STARTED:
        missing_opponents = simul.missing_opponents()
        if missing_opponents:
            log.warning(
                "Recovering %s missing game(s) for partially started simul %s",
                len(missing_opponents),
                simul.id,
            )
            await simul.create_games()

    if simul.status == T_STARTED and len(simul.ongoing_games) == 0 and len(simul.games) > 0:
        simul.status = T_FINISHED
        if simul.ends_at is None:
            simul.ends_at = datetime.now(UTC)
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
    await app_state.db.simul.create_index("hostSeenAt")
    await app_state.db.simul.create_index("players.user")
    await app_state.db.simul.create_index("pendingPlayers.user")
    await app_state.db.simul.create_index(
        [("status", 1), ("featurable", 1), ("hostSeenAt", -1), ("createdAt", -1)],
        name="status_featurable_hostSeenAt_createdAt",
    )
    await app_state.db.simul.create_index(
        [("status", 1), ("featurable", 1), ("endsAt", -1)],
        name="status_featurable_endsAt",
    )
    await app_state.db.simul.create_index(
        [("createdBy", 1), ("status", 1), ("createdAt", -1)],
        name="createdBy_status_createdAt",
    )

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

    loaded = 0
    for doc in docs:
        simul_id = doc.get("_id")
        if not isinstance(simul_id, str):
            continue
        try:
            if await load_simul(app_state, simul_id, simul_doc=doc) is not None:
                loaded += 1
        except Exception:
            # One damaged or temporarily unrecoverable simul must not prevent the
            # rest of application startup. It can be retried later on demand.
            log.exception("Failed to restore active simul %s", simul_id)

    log.info("Loaded active simuls from db: %s loaded, %s skipped", loaded, len(docs) - loaded)


def _simul_list_entry(simul_doc: SimulDoc, username: str | None = None) -> SimulListEntry | None:
    simul_id = simul_doc.get("_id")
    created_by = simul_doc.get("createdBy")
    variants = _as_str_list(simul_doc.get("variants"))
    name = simul_doc.get("name")
    if not isinstance(simul_id, str) or not isinstance(created_by, str) or not variants:
        return None
    if not isinstance(name, str):
        name = "Simul"

    players = _as_simul_participants(simul_doc.get("players"))
    pending_players = _as_simul_participants(simul_doc.get("pendingPlayers"))
    participation = None
    if username is not None:
        if username == created_by:
            participation = "host"
        elif any(player["user"] == username for player in pending_players):
            participation = "pending"
        elif any(player["user"] == username for player in players):
            participation = "accepted"

    primary_variant, primary_chess960 = split_simul_variant_key(variants[0])
    icon = get_server_variant(primary_variant, primary_chess960).icon

    return SimulListEntry(
        id=simul_id,
        name=name,
        variants=variants,
        icon=icon,
        base=_parse_int(simul_doc.get("base"), 1),
        inc=_parse_int(simul_doc.get("inc"), 0),
        created_by=created_by,
        created_at=_as_datetime(simul_doc.get("createdAt")),
        starts_at=_as_datetime(simul_doc.get("startsAt")),
        estimated_start_at=_as_datetime(simul_doc.get("estimatedStartAt")),
        status=_parse_status(simul_doc.get("status")),
        players_count=len(players),
        participation=participation,
    )


async def _query_simul_list(
    app_state: PychessGlobalAppState,
    selector: dict[str, object],
    *,
    sort_field: str,
    limit: int,
    username: str | None = None,
) -> list[SimulListEntry]:
    if app_state.db is None:
        return []

    cursor = app_state.db.simul.find(selector)
    try:
        cursor.sort(sort_field, -1)
        cursor.limit(limit)
    except AttributeError:
        pass
    docs = await cursor.to_list(length=None)

    entries: list[SimulListEntry] = []
    for doc in docs:
        entry = _simul_list_entry(doc, username=username)
        if entry is not None:
            entries.append(entry)
    return entries


async def get_hosted_simuls(
    app_state: PychessGlobalAppState, username: str, page: int
) -> tuple[list[SimulListEntry], int]:
    if app_state.db is None:
        return [], 0

    page = max(page, 1)
    selector: dict[str, object] = {"status": T_FINISHED, "createdBy": username}
    total = await app_state.db.simul.count_documents(selector)

    cursor = (
        app_state.db.simul.find(selector)
        .sort("createdAt", -1)
        .skip((page - 1) * SIMUL_HISTORY_PAGE_SIZE)
        .limit(SIMUL_HISTORY_PAGE_SIZE)
    )
    docs = await cursor.to_list(length=SIMUL_HISTORY_PAGE_SIZE)
    entries = [entry for doc in docs if (entry := _simul_list_entry(doc)) is not None]

    by_id = {entry.id: entry for entry in entries}
    if not by_id:
        return entries, total

    games = app_state.db.game.find(
        {"sid": {"$in": list(by_id)}},
        projection={"_id": 0, "sid": 1, "r": 1, "sh": 1},
    )
    async for game_doc in games:
        simul_id = game_doc.get("sid")
        host_side = game_doc.get("sh")
        result_code = game_doc.get("r")
        if not isinstance(simul_id, str) or simul_id not in by_id:
            continue
        if host_side not in ("w", "b") or not isinstance(result_code, str):
            continue

        result = C2R.get(result_code, "*")
        entry = by_id[simul_id]
        if result == "1/2-1/2":
            entry.draws += 1
        elif (result == "1-0" and host_side == "w") or (result == "0-1" and host_side == "b"):
            entry.wins += 1
        elif result in ("1-0", "0-1"):
            entry.losses += 1

    return entries, total


async def get_simul_home_lists(
    app_state: PychessGlobalAppState, username: str | None = None
) -> tuple[
    list[SimulListEntry],
    list[SimulListEntry],
    list[SimulListEntry],
    list[SimulListEntry],
]:
    if app_state.db is None:
        return [], [], [], []

    created_cutoff = datetime.now(UTC) - CREATED_SIMUL_RESTART_WINDOW
    active_created_selector: dict[str, object] = {
        "status": T_CREATED,
        "hostSeenAt": {"$gte": created_cutoff},
    }

    created_query = _query_simul_list(
        app_state,
        {**active_created_selector, "featurable": True},
        sort_field="createdAt",
        limit=SIMUL_HOME_CREATED_LIMIT,
    )
    started_query = _query_simul_list(
        app_state,
        {"status": T_STARTED},
        sort_field="startsAt",
        limit=SIMUL_HOME_STARTED_LIMIT,
    )
    finished_query = _query_simul_list(
        app_state,
        {"status": T_FINISHED, "featurable": True},
        sort_field="endsAt",
        limit=SIMUL_HOME_FINISHED_LIMIT,
    )

    if username is None:
        created, started, finished = await asyncio.gather(
            created_query, started_query, finished_query
        )
        return [], created, started, finished

    my_query = _query_simul_list(
        app_state,
        {
            **active_created_selector,
            "$or": [
                {"createdBy": username},
                {"pendingPlayers.user": username},
                {"players.user": username},
            ],
        },
        sort_field="createdAt",
        limit=SIMUL_HOME_MINE_LIMIT,
        username=username,
    )
    my_simuls, created, started, finished = await asyncio.gather(
        my_query, created_query, started_query, finished_query
    )
    return my_simuls, created, started, finished
