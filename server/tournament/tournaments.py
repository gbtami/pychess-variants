from __future__ import annotations
from typing import Any, TYPE_CHECKING, Iterable, Mapping, Protocol, cast
from datetime import datetime, timedelta, timezone
import asyncio

import aiohttp_session
from aiohttp import web
import logging

from tournament.arena import ArenaTournament
from compress import C2R, R2C
from const import (
    ARENA,
    BYEGAME,
    RR,
    SWISS,
    T_STARTED,
    T_CREATED,
    T_ABORTED,
    T_FINISHED,
    T_ARCHIVED,
    SHIELD,
    MAX_CHAT_LINES,
    STARTED,
    CATEGORIES,
    TRANSLATED_FREQUENCY_NAMES,
    TRANSLATED_PAIRING_SYSTEM_NAMES,
    TEST_PREFIX,
    VARIANTEND,
)
from newid import new_id

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from game import Game
from pychess_global_app_state_utils import get_app_state
from tournament.rr import RRTournament
from tournament.swiss import SwissTournament
from tournament.tournament import (
    AUTO_ROUND_INTERVAL,
    MANUAL_ROUND_INTERVAL,
    ByeGame,
    GameData,
    PlayerData,
    RR_DEFAULT_MAX_PLAYERS,
    RR_MAX_SUPPORTED_PLAYERS,
    SCORE_SHIFT,
    Tournament,
    upsert_tournament_to_db,
)
from tournament.auto_play_tournament import (
    ArenaTestTournament,
    SwissTestTournament,
    RRTestTournament,
    AUTO_PLAY_TOURNAMENT_ID,
)
from typing_defs import (
    TournamentArrangementDoc,
    TournamentCreateData,
    TournamentDoc,
    TournamentPairingDoc,
    TournamentPoint,
    TournamentPlayerDoc,
)
from ws_types import ChatLine
from variants import C2V, get_server_variant, ALL_VARIANTS, VARIANTS
from user import User
from utils import load_game
from settings import DEV

log = logging.getLogger(__name__)

WinnerEntry = tuple[str, str, str]
ScheduledTournamentEntry = tuple[str, str, bool, datetime, int, str]
TournamentTables = tuple[list[Tournament], list[Tournament], list[Tournament]]
ROUND_INTERVAL_SECONDS: frozenset[int] = frozenset(
    (
        5,
        10,
        20,
        30,
        45,
        60,
        120,
        180,
        300,
        600,
        900,
        1200,
        1800,
        2700,
        3600,
        86400,
        172800,
        604800,
    )
)


class Translation(Protocol):
    def gettext(self, message: str) -> str: ...


def _align_player_games_with_points(player_data: PlayerData) -> None:
    if not player_data.points:
        return

    # Round-aware Swiss states should not be re-ordered by point-shape heuristics.
    if any(getattr(game, "round", None) is not None for game in player_data.games):
        return

    non_bye_games = [game for game in player_data.games if not isinstance(game, ByeGame)]
    bye_games = [game for game in player_data.games if isinstance(game, ByeGame)]

    rebuilt: list[Game | GameData | ByeGame] = []
    non_bye_index = 0
    bye_index = 0

    for point in player_data.points:
        if point == "-":
            if bye_index < len(bye_games):
                rebuilt.append(bye_games[bye_index])
                bye_index += 1
            else:
                rebuilt.append(ByeGame())
            continue

        if non_bye_index >= len(non_bye_games):
            break

        rebuilt.append(non_bye_games[non_bye_index])
        non_bye_index += 1

    while non_bye_index < len(non_bye_games):
        rebuilt.append(non_bye_games[non_bye_index])
        non_bye_index += 1

    while bye_index < len(bye_games):
        rebuilt.append(bye_games[bye_index])
        bye_index += 1

    player_data.games = rebuilt


def _fixed_round_entry_point_value(point: object, variant: str) -> int:
    if point == "-":
        return 7 if variant == "janggi" else 2
    if isinstance(point, (tuple, list)) and len(point) > 0 and isinstance(point[0], int):
        return point[0]
    return 0


def _swiss_unplayed_point_from_token(token: str, variant: str):
    if token == "U":
        return "-"
    if token == "H":
        if variant == "janggi":
            return (2, 0)
        return (1, 0)
    if token == "F":
        return (7, 0) if variant == "janggi" else (2, 0)
    return (0, 0)


def _parse_round_interval(
    value: Any,
    *,
    system: int,
    default_value: int,
) -> int:
    if system == ARENA:
        return 0

    if value in (None, "", "auto"):
        return AUTO_ROUND_INTERVAL
    if value == "manual":
        return MANUAL_ROUND_INTERVAL

    try:
        interval = int(value)
    except (TypeError, ValueError):
        return default_value

    if interval in ROUND_INTERVAL_SECONDS:
        return interval
    return default_value


def _parse_rr_max_players(value: Any, *, default_value: int) -> int:
    try:
        rr_max_players = int(value)
    except (TypeError, ValueError):
        rr_max_players = default_value

    return max(3, min(RR_MAX_SUPPORTED_PLAYERS, rr_max_players))


def _infer_swiss_point_from_game(
    tournament: Tournament,
    game: Game | GameData | ByeGame,
    username: str,
):
    if isinstance(game, ByeGame):
        return _swiss_unplayed_point_from_token(getattr(game, "token", "U"), tournament.variant)

    result = game.result
    if result not in ("1-0", "0-1", "1/2-1/2"):
        return None

    if result == "1/2-1/2":
        return (0 if tournament.variant == "janggi" else 1, 1)

    is_white = game.wplayer.username == username
    won = (result == "1-0" and is_white) or (result == "0-1" and not is_white)

    if tournament.variant == "janggi":
        if getattr(game, "status", None) == VARIANTEND:
            return (4 if won else 2, 1)
        return (7 if won else 0, 1)

    return (2 if won else 0, 1)


async def _repair_swiss_state_from_history(tournament: Tournament) -> None:
    repaired_users: list[str] = []

    for user, player_data in tournament.players.items():
        repaired = False
        username = player_data.username

        initial_points = list(player_data.points)
        initial_games = list(player_data.games)

        _align_player_games_with_points(player_data)

        while len(player_data.points) < len(player_data.games):
            game = player_data.games[len(player_data.points)]
            inferred = _infer_swiss_point_from_game(tournament, game, username)
            if inferred is None:
                log.warning(
                    "Swiss load repair could not infer point for %s in %s at round index %s",
                    username,
                    tournament.id,
                    len(player_data.points),
                )
                break
            player_data.points.append(inferred)
            repaired = True

        while len(player_data.points) > len(player_data.games):
            next_point = player_data.points[len(player_data.games)]
            if next_point != "-":
                log.warning(
                    "Swiss load repair found extra non-bye point without game for %s in %s",
                    username,
                    tournament.id,
                )
                break
            player_data.games.append(ByeGame())
            repaired = True

        _align_player_games_with_points(player_data)

        if player_data.points != initial_points or player_data.games != initial_games:
            repaired = True

        if not repaired:
            continue

        total_points = sum(
            _fixed_round_entry_point_value(point, tournament.variant)
            for point in player_data.points
        )
        full_score = tournament.compose_leaderboard_score(total_points, player_data)
        if tournament.leaderboard_player_by_username(username) is not None:
            tournament.set_leaderboard_score_by_username(username, full_score)
        repaired_users.append(username)

    if not repaired_users:
        return

    log.warning(
        "Swiss load repair adjusted player state from pairing history in %s: %s",
        tournament.id,
        sorted(repaired_users),
    )

    for username in repaired_users:
        await tournament.db_update_player(username, "GAME_END")


async def _recover_incomplete_fixed_round_pairing_round(
    tournament: Tournament,
    stored_round: int | None,
) -> int | None:
    round_no = tournament.pairing_in_progress_round
    if round_no is None:
        return stored_round

    if round_no <= 0:
        tournament.pairing_in_progress_round = None
        return stored_round

    system_name = "Swiss" if tournament.system == SWISS else "RR"
    expected_usernames = {
        player_data.username
        for player_data in tournament.players.values()
        if not player_data.withdrawn and player_data.joined_round <= round_no
    }
    accounted_usernames = {
        player_data.username
        for player_data in tournament.players.values()
        if any(getattr(game, "round", None) == round_no for game in player_data.games)
    }
    round_is_complete = expected_usernames.issubset(accounted_usernames)

    if round_is_complete:
        tournament.current_round = max(tournament.current_round, round_no)
        await tournament.save_current_round()
        log.warning(
            "Recovered %s round %s in %s from persisted pairing state after interrupted commit",
            system_name,
            round_no,
            tournament.id,
        )
        return tournament.current_round

    pairing_table = tournament.app_state.db.tournament_pairing
    pairing_docs = await pairing_table.find({"tid": tournament.id, "rn": round_no}).to_list(
        length=None
    )
    game_ids = [doc["_id"] for doc in pairing_docs if doc.get("s") != BYEGAME]

    if game_ids:
        await tournament.app_state.db.game.delete_many({"_id": {"$in": game_ids}})
    else:
        await tournament.app_state.db.game.delete_many({"tid": tournament.id, "r": R2C["*"]})
    if pairing_docs:
        await pairing_table.delete_many({"tid": tournament.id, "rn": round_no})

    rolled_back_users: list[str] = []
    rolled_back_game_ids = {
        game.id for game in tournament.ongoing_games if getattr(game, "round", None) == round_no
    }
    for player_data in tournament.players.values():
        _align_player_games_with_points(player_data)

        rebuilt_games: list[Game | GameData | ByeGame] = []
        rebuilt_points: list[TournamentPoint] = []
        changed = False

        for index, game in enumerate(player_data.games):
            if getattr(game, "round", None) == round_no:
                changed = True
                continue
            rebuilt_games.append(game)
            if index < len(player_data.points):
                rebuilt_points.append(player_data.points[index])

        if not changed:
            continue

        player_data.games = rebuilt_games
        player_data.points = rebuilt_points
        player_data.free = True
        rolled_back_users.append(player_data.username)

    tournament.ongoing_games = {
        game for game in tournament.ongoing_games if getattr(game, "round", None) != round_no
    }
    for game_id in rolled_back_game_ids:
        tournament.app_state.games.pop(game_id, None)

    for player_data in tournament.players.values():
        total_points = sum(
            _fixed_round_entry_point_value(point, tournament.variant)
            for point in player_data.points
        )
        if tournament.leaderboard_player_by_username(player_data.username) is not None:
            tournament.set_leaderboard_score_by_username(
                player_data.username,
                tournament.compose_leaderboard_score(total_points, player_data),
            )

    tournament.recalculate_berger_tiebreak()
    tournament.current_round = max(0, round_no - 1)
    tournament.pairing_in_progress_round = None
    await tournament.app_state.db.tournament.update_one(
        {"_id": tournament.id},
        {
            "$set": {"cr": tournament.current_round},
            "$unset": {"pairingInProgressRound": ""},
        },
    )
    for username in rolled_back_users:
        await tournament.db_update_player(username, "GAME_END")

    log.warning(
        "Rolled back incomplete %s round %s in %s after interrupted pairing commit",
        system_name,
        round_no,
        tournament.id,
    )
    return tournament.current_round


async def create_or_update_tournament(
    app_state: PychessGlobalAppState,
    username: str,
    form: Mapping[str, Any],
    tournament: Tournament | None = None,
) -> None:
    """Manual tournament creation from /tournaments/new form input values"""

    variant = form["variant"]
    variant960 = variant.endswith("960")
    variant_name = variant[:-3] if variant960 else variant
    server_variant = get_server_variant(variant_name, variant960)

    rated = form.get("rated", "") == "1" and form["position"] == ""
    base = float(form["clockTime"])
    inc = int(form["clockIncrement"])
    bp = int(form["byoyomiPeriod"])
    frequency = tournament.frequency if tournament is not None else ""

    if tournament is None:
        try:
            system = int(form.get("system", ARENA))
        except (TypeError, ValueError):
            system = ARENA
        if system not in (ARENA, RR, SWISS):
            system = ARENA
        if (not DEV) and system in (RR, SWISS):
            raise web.HTTPBadRequest(
                text="Round-Robin and Swiss tournament creation is disabled in production."
            )
    else:
        # Editing keeps existing pairing type to avoid mutating tournament class behavior.
        system = tournament.system

    try:
        rounds = int(form.get("rounds", 0))
    except (TypeError, ValueError):
        rounds = 0
    if system == ARENA:
        rounds = 0
    elif system == RR:
        if tournament is not None and tournament.status != T_CREATED:
            rounds = tournament.rounds
        else:
            rounds = 0
    elif rounds <= 0:
        rounds = 5

    default_rr_max_players = (
        tournament.rr_join_limit() if tournament is not None else RR_DEFAULT_MAX_PLAYERS
    )
    rr_max_players = _parse_rr_max_players(
        form.get("rrMaxPlayers"),
        default_value=default_rr_max_players,
    )
    rr_requires_approval = form.get("rrRequiresApproval", "") == "1"
    rr_joining_closed = (
        bool(getattr(tournament, "rr_joining_closed", False)) if tournament else False
    )
    if system != RR:
        rr_max_players = 0
        rr_requires_approval = False
        rr_joining_closed = False

    default_round_interval = (
        AUTO_ROUND_INTERVAL if tournament is None else getattr(tournament, "round_interval", 0)
    )
    round_interval = _parse_round_interval(
        form.get("roundInterval"),
        system=system,
        default_value=default_round_interval,
    )

    try:
        entry_min_rating = int(form.get("entryMinRating", 0) or 0)
    except (TypeError, ValueError):
        entry_min_rating = 0
    try:
        entry_max_rating = int(form.get("entryMaxRating", 0) or 0)
    except (TypeError, ValueError):
        entry_max_rating = 0
    try:
        entry_min_rated_games = int(form.get("entryMinRatedGames", 0) or 0)
    except (TypeError, ValueError):
        entry_min_rated_games = 0
    try:
        entry_min_account_age_days = int(form.get("entryMinAccountAgeDays", 0) or 0)
    except (TypeError, ValueError):
        entry_min_account_age_days = 0
    entry_titled_only = form.get("entryTitledOnly", "") == "1"
    forbidden_pairings = (form.get("forbiddenPairings", "") or "").replace("\r\n", "\n").strip()
    manual_pairings = (form.get("manualPairings", "") or "").replace("\r\n", "\n").strip()

    if system != SWISS:
        forbidden_pairings = ""
        manual_pairings = ""

    if entry_max_rating > 0 and entry_min_rating > entry_max_rating:
        entry_min_rating, entry_max_rating = entry_max_rating, entry_min_rating

    if system != ARENA:
        frequency = ""

    start_date: datetime | None
    if form["startDate"]:
        start_date = datetime.fromisoformat(form["startDate"].rstrip("Z")).replace(
            tzinfo=timezone.utc
        )
    else:
        start_date = None

    end_date: datetime | None
    if form.get("endDate"):
        end_date = datetime.fromisoformat(form["endDate"].rstrip("Z")).replace(tzinfo=timezone.utc)
    else:
        end_date = None

    now = datetime.now(timezone.utc)
    if start_date is not None and start_date <= now:
        raise web.HTTPBadRequest(text="Tournament start date must be in the future.")

    minutes = int(form["minutes"])
    effective_start_date = start_date
    if end_date is not None:
        if effective_start_date is None:
            effective_start_date = now + timedelta(minutes=int(form["waitMinutes"]))
            start_date = effective_start_date
        if end_date <= effective_start_date:
            raise web.HTTPBadRequest(text="Tournament end date must be after the start date.")
        delta_minutes = int(max(1, (end_date - effective_start_date).total_seconds() // 60))
        if (
            end_date > effective_start_date
            and (end_date - effective_start_date).total_seconds() % 60
        ):
            delta_minutes += 1
        minutes = max(1, delta_minutes)

    name = form["name"].strip()
    # Create meaningful tournament name in case we forget to change it :)
    if name == "":
        name = server_variant.display_name.title()

    description = form["description"]
    if frequency == SHIELD:
        name = "%s Shield Arena" % server_variant.display_name.title()

    data: TournamentCreateData = {
        "name": name,
        "password": form["password"],
        "createdBy": username,
        "rated": rated,
        "variant": variant_name,
        "chess960": variant960,
        "base": base,
        "inc": inc,
        "bp": bp,
        "system": system,
        "beforeStart": int(form["waitMinutes"]),
        "startDate": start_date,
        "frequency": frequency,
        "minutes": minutes,
        "fen": form["position"],
        "rounds": rounds,
        "rrMaxPlayers": rr_max_players,
        "rrRequiresApproval": rr_requires_approval,
        "rrJoiningClosed": rr_joining_closed,
        "roundInterval": round_interval,
        "entryMinRating": entry_min_rating,
        "entryMaxRating": entry_max_rating,
        "entryMinRatedGames": entry_min_rated_games,
        "entryMinAccountAgeDays": entry_min_account_age_days,
        "entryTitledOnly": entry_titled_only,
        "forbiddenPairings": forbidden_pairings,
        "manualPairings": manual_pairings,
        "description": description,
    }
    if tournament is None:
        tournament = await new_tournament(app_state, data)
    else:
        allow_started_position_edit = (
            tournament.status != T_CREATED
            and tournament.system in (ARENA, SWISS)
            and bool(tournament.fen)
        )
        if tournament.status != T_CREATED:
            if data["variant"] != tournament.variant or data["chess960"] != tournament.chess960:
                raise web.HTTPForbidden(
                    text="Variant cannot be changed after the tournament has started."
                )
            if (
                data["base"] != tournament.base
                or data["inc"] != tournament.inc
                or data["bp"] != tournament.byoyomi_period
            ):
                raise web.HTTPForbidden(
                    text="Time control cannot be changed after the tournament has started."
                )
            if data["startDate"] is not None and data["startDate"] != tournament.starts_at:
                raise web.HTTPForbidden(
                    text="Start date cannot be changed after the tournament has started."
                )
            if data["fen"] != tournament.fen and not allow_started_position_edit:
                raise web.HTTPForbidden(
                    text="Starting position cannot be changed after the tournament has started."
                )

        # We want to update some data of the tournament created by new_tournament() before.
        # upsert=True will do this update at the end of upsert_tournament_to_db()
        tournament.name = data["name"]
        tournament.password = data["password"]
        if tournament.status == T_CREATED:
            tournament.variant = data["variant"]
            tournament.chess960 = data["chess960"]
            tournament.base = data["base"]
            tournament.inc = data["inc"]
            tournament.bp = data["bp"]
        tournament.rated = data["rated"]
        if tournament.status == T_CREATED or tournament.system == SWISS:
            tournament.rounds = data["rounds"]
        tournament.rr_max_players = data["rrMaxPlayers"]
        tournament.rr_requires_approval = data["rrRequiresApproval"]
        tournament.rr_joining_closed = data["rrJoiningClosed"]
        tournament.round_interval = data["roundInterval"]
        tournament.entry_min_rating = data["entryMinRating"]
        tournament.entry_max_rating = data["entryMaxRating"]
        tournament.entry_min_rated_games = data["entryMinRatedGames"]
        tournament.entry_min_account_age_days = data["entryMinAccountAgeDays"]
        tournament.entry_titled_only = data["entryTitledOnly"]
        tournament.forbidden_pairings = data["forbiddenPairings"]
        tournament.manual_pairings = data["manualPairings"]
        tournament.beforeStart = data["beforeStart"]
        if tournament.status == T_CREATED:
            tournament.starts_at = data["startDate"]  # type: ignore[assignment]
        tournament.frequency = data["frequency"]
        tournament.minutes = data["minutes"]
        if tournament.status == T_CREATED or allow_started_position_edit:
            tournament.fen = data["fen"]
        tournament.description = data["description"]

        # re-calculate created_at, starts_at, ends_at etc.
        tournament.initialize()
        await upsert_tournament_to_db(tournament, app_state)

    await broadcast_tournament_creation(app_state, tournament)


async def broadcast_tournament_creation(
    app_state: PychessGlobalAppState, tournament: Tournament
) -> None:
    await tournament.broadcast_spotlight()
    await app_state.discord.send_to_discord("create_tournament", tournament.create_discord_msg)


async def new_tournament(
    app_state: PychessGlobalAppState, data: TournamentCreateData
) -> Tournament:
    if "tid" not in data:
        tid = await new_id(app_state.db.tournament)
    else:
        tid = data["tid"]

    tournament_class: type[Tournament]
    if data["system"] == ARENA:
        tournament_class = ArenaTournament
    elif data["system"] == SWISS:
        tournament_class = SwissTournament
    elif data["system"] == RR:
        tournament_class = RRTournament
    else:
        raise ValueError("Unknown tournament system")

    tournament = tournament_class(
        app_state,
        tid,
        variant=data["variant"],
        base=data["base"],
        inc=data["inc"],
        byoyomi_period=data.get("bp", 0),
        rated=data.get("rated", True),
        chess960=data.get("chess960", False),
        fen=data.get("fen", ""),
        rounds=data.get("rounds", 0),
        rr_max_players=data.get("rrMaxPlayers", 0),
        rr_requires_approval=data.get("rrRequiresApproval", False),
        rr_joining_closed=data.get("rrJoiningClosed", False),
        round_interval=data.get("roundInterval", 0),
        entry_min_rating=data.get("entryMinRating", 0),
        entry_max_rating=data.get("entryMaxRating", 0),
        entry_min_rated_games=data.get("entryMinRatedGames", 0),
        entry_min_account_age_days=data.get("entryMinAccountAgeDays", 0),
        entry_titled_only=data.get("entryTitledOnly", False),
        forbidden_pairings=data.get("forbiddenPairings", ""),
        manual_pairings=data.get("manualPairings", ""),
        created_by=data["createdBy"],
        before_start=data.get("beforeStart", 5),
        minutes=data.get("minutes", 45),
        starts_at=data.get("startDate"),
        frequency=data.get("frequency", ""),
        name=data["name"],
        password=data.get("password", ""),
        description=data.get("description", ""),
        created_at=data.get("createdAt"),
        status=data.get("status"),
        finish_reason=data.get("finishReason"),
        with_clock=data.get("with_clock", True),
    )

    app_state.tournaments[tid] = tournament
    app_state.tourneysockets[tid] = {}

    await upsert_tournament_to_db(tournament, app_state)

    return tournament


async def get_winners(
    app_state: PychessGlobalAppState,
    shield: bool,
    variant: str | None = None,
    variants: Iterable[str] | None = None,
) -> dict[str, list[WinnerEntry]]:
    wi: dict[str, list[WinnerEntry]] = {}
    if variants is None:
        if variant is None:
            variants = VARIANTS
            limit = 5
        else:
            variants = (variant,)
            limit = 50
    else:
        limit = 5

    for variant in variants:
        variant960 = variant.endswith("960")
        uci_variant = variant[:-3] if variant960 else variant

        v = get_server_variant(uci_variant, variant960)
        z = 1 if variant960 else 0

        filter_cond = {"v": v.code, "z": z, "status": {"$in": [T_FINISHED, T_ARCHIVED]}}
        if shield:
            filter_cond["fr"] = SHIELD

        winners: list[WinnerEntry] = []
        cursor = app_state.db.tournament.find(filter_cond, sort=[("startsAt", -1)], limit=limit)
        async for doc in cursor:
            tournament_doc: TournamentDoc = doc
            if "winner" in tournament_doc:
                starts_at = tournament_doc["startsAt"]
                winners.append(
                    (
                        tournament_doc["winner"],
                        starts_at.strftime("%Y.%m.%d"),
                        tournament_doc["_id"],
                    )
                )
                await app_state.users.get(tournament_doc["winner"])

        wi[variant] = winners

    return wi


async def get_scheduled_tournaments(
    app_state: PychessGlobalAppState, nb_max: int = 30
) -> list[ScheduledTournamentEntry]:
    """Return max 30 already scheduled tournaments from mongodb"""
    cursor = app_state.db.tournament.find({"$or": [{"status": T_STARTED}, {"status": T_CREATED}]})
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    tournaments: list[ScheduledTournamentEntry] = []

    async for doc in cursor:
        tournament_doc: TournamentDoc = doc
        if (
            tournament_doc["status"] in (T_CREATED, T_STARTED)
            and tournament_doc["createdBy"] == "PyChess"
            and tournament_doc.get("fr", "") != ""
        ):
            nb_tournament += 1
            if nb_tournament > nb_max:
                break
            else:
                tournaments.append(
                    (
                        tournament_doc["fr"],
                        C2V[tournament_doc["v"]],
                        bool(tournament_doc["z"]),
                        tournament_doc["startsAt"],
                        tournament_doc["minutes"],
                        tournament_doc["_id"],
                    )
                )
    return tournaments


async def get_latest_tournaments(app_state: PychessGlobalAppState, lang: str) -> TournamentTables:
    started: list[Tournament] = []
    scheduled: list[Tournament] = []
    completed: list[Tournament] = []

    cursor = app_state.db.tournament.find()
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    async for doc in cursor:
        tournament_doc: TournamentDoc = doc
        nb_tournament += 1
        if nb_tournament > 31:
            break

        tid = tournament_doc["_id"]
        if tid in app_state.tournaments:
            tournament = app_state.tournaments[tid]
        else:
            tournament_class: type[Tournament]
            if tournament_doc["system"] == ARENA:
                tournament_class = ArenaTournament
            elif tournament_doc["system"] == SWISS:
                tournament_class = SwissTournament
            elif tournament_doc["system"] == RR:
                tournament_class = RRTournament
            elif TYPE_CHECKING:
                tournament_class = ArenaTournament

            tournament = tournament_class(
                app_state,
                tid,
                C2V[tournament_doc["v"]],
                base=tournament_doc["b"],
                inc=tournament_doc["i"],
                byoyomi_period=int(bool(tournament_doc.get("bp"))),
                rated=tournament_doc.get("y"),
                chess960=bool(tournament_doc.get("z")),
                fen=tournament_doc.get("f"),
                rounds=tournament_doc["rounds"],
                rr_max_players=tournament_doc.get(
                    "rrMaxPlayers",
                    min(RR_MAX_SUPPORTED_PLAYERS, max(3, tournament_doc["rounds"] + 1))
                    if tournament_doc["system"] == RR and tournament_doc["rounds"] > 0
                    else 0,
                ),
                rr_requires_approval=tournament_doc.get("rrRequiresApproval", False),
                rr_joining_closed=tournament_doc.get("rrJoiningClosed", False),
                round_interval=tournament_doc.get("ri", 0),
                entry_min_rating=tournament_doc.get("entryMinRating", 0),
                entry_max_rating=tournament_doc.get("entryMaxRating", 0),
                entry_min_rated_games=tournament_doc.get("entryMinRatedGames", 0),
                entry_min_account_age_days=tournament_doc.get("entryMinAccountAgeDays", 0),
                entry_titled_only=tournament_doc.get("entryTitledOnly", False),
                forbidden_pairings=tournament_doc.get("forbiddenPairings", ""),
                manual_pairings=tournament_doc.get("manualPairings", ""),
                created_by=tournament_doc["createdBy"],
                created_at=tournament_doc["createdAt"],
                minutes=tournament_doc["minutes"],
                starts_at=tournament_doc.get("startsAt"),
                name=tournament_doc["name"],
                description=tournament_doc.get("d", ""),
                frequency=tournament_doc.get("fr", ""),
                status=tournament_doc["status"],
                finish_reason=tournament_doc.get("finishReason"),
                with_clock=False,
            )
            tournament.nb_players = tournament_doc["nbPlayers"]
            tournament.rr_pending_players = set(tournament_doc.get("rrPendingPlayers", []))
            tournament.rr_denied_players = set(tournament_doc.get("rrDeniedPlayers", []))

        if tournament.frequency:
            try:
                tournament.translated_name = app_state.tourneynames[lang][
                    (
                        tournament.variant + ("960" if tournament.chess960 else ""),
                        tournament.frequency,
                        tournament.system,
                    )
                ]
            except KeyError:
                tournament.translated_name = tournament.name
        else:
            tournament.translated_name = tournament.name

        if tournament_doc["status"] == T_STARTED:
            started.append(tournament)
        elif tournament_doc["status"] < T_STARTED:
            scheduled.append(tournament)
        elif tournament_doc["status"] > T_STARTED:
            completed.append(tournament)

    scheduled = sorted(scheduled, key=lambda tournament: tournament.starts_at)

    return (started, scheduled, completed)


async def get_tournament_name(request: web.Request, tournament_id: str | None) -> str:
    """Return Tournament name from app cache or from database"""
    app_state = get_app_state(request.app)
    # todo: similar logic for determining lang already exists in index.py, except this "l" param. If it is specific for
    #       when called via the game_api move that there and re-use the rest about session+user from index.py
    #       finally change param of this function to get_tournament_name(app_state, tournament_id, lang)
    lang = request.rel_url.query.get("l")
    if lang is None:
        session = await aiohttp_session.get_session(request)
        session_user: str | None = session.get("user_name")
        if session_user is None:
            lang = "en"
        else:
            try:
                lang = app_state.users[session_user].lang
            except KeyError:
                lang = "en"
        if lang is None:
            lang = "en"

    if tournament_id in app_state.tourneynames[lang]:
        return app_state.tourneynames[lang][tournament_id]

    tournaments = app_state.tournaments
    name = ""

    if tournament_id in tournaments:
        tournament = tournaments[tournament_id]
        if tournament.frequency:
            try:
                name = app_state.tourneynames[lang][
                    (
                        tournament.variant + ("960" if tournament.chess960 else ""),
                        tournament.frequency,
                        tournament.system,
                    )
                ]
            except KeyError:
                name = tournament.name
        else:
            name = tournament.name
    else:
        doc = await app_state.db.tournament.find_one({"_id": tournament_id})
        if doc is not None:
            tournament_doc: TournamentDoc = doc
            frequency = tournament_doc.get("fr", "")
            if frequency:
                chess960 = bool(tournament_doc.get("z"))
                try:
                    name = app_state.tourneynames[lang][
                        (
                            C2V[tournament_doc["v"]] + ("960" if chess960 else ""),
                            frequency,
                            tournament_doc["system"],
                        )
                    ]
                except KeyError:
                    name = "%s %s %s" % (
                        C2V[tournament_doc["v"]] + ("960" if chess960 else ""),
                        frequency,
                        tournament_doc["system"],
                    )
            else:
                name = tournament_doc["name"]
        app_state.tourneynames[lang][tournament_id] = name

    return name


async def load_tournament(
    app_state: PychessGlobalAppState,
    tournament_id: str,
    tournament_klass: type[Tournament] | None = None,
) -> Tournament | None:
    """Return Tournament object from app cache or from database"""
    if tournament_id in app_state.tournaments:
        tournament = app_state.tournaments[tournament_id]
        app_state.schedule_tournament_cache_removal(tournament)
        return tournament

    doc = await app_state.db.tournament.find_one({"_id": tournament_id})

    if doc is None:
        return None

    tournament_doc: TournamentDoc = doc
    stored_round = tournament_doc.get("cr")
    pairing_in_progress_round = tournament_doc.get("pairingInProgressRound")

    auto_play = tournament_id == AUTO_PLAY_TOURNAMENT_ID
    tournament_class: type[Tournament]

    if tournament_doc["system"] == ARENA:
        tournament_class = ArenaTestTournament if auto_play else ArenaTournament
    elif tournament_doc["system"] == SWISS:
        tournament_class = SwissTestTournament if auto_play else SwissTournament
    elif tournament_doc["system"] == RR:
        tournament_class = RRTestTournament if auto_play else RRTournament
    elif tournament_klass is not None:
        tournament_class = tournament_klass
    elif TYPE_CHECKING:
        tournament_class = ArenaTournament

    tournament = tournament_class(
        app_state,
        tournament_doc["_id"],
        C2V[tournament_doc["v"]],
        base=tournament_doc["b"],
        inc=tournament_doc["i"],
        byoyomi_period=int(bool(tournament_doc.get("bp"))),
        rated=bool(tournament_doc.get("y")),
        chess960=bool(tournament_doc.get("z")),
        fen=tournament_doc.get("f"),
        rounds=tournament_doc["rounds"],
        rr_max_players=tournament_doc.get(
            "rrMaxPlayers",
            min(RR_MAX_SUPPORTED_PLAYERS, max(3, tournament_doc["rounds"] + 1))
            if tournament_doc["system"] == RR and tournament_doc["rounds"] > 0
            else 0,
        ),
        rr_requires_approval=tournament_doc.get("rrRequiresApproval", False),
        rr_joining_closed=tournament_doc.get("rrJoiningClosed", False),
        round_interval=tournament_doc.get("ri", 0),
        entry_min_rating=tournament_doc.get("entryMinRating", 0),
        entry_max_rating=tournament_doc.get("entryMaxRating", 0),
        entry_min_rated_games=tournament_doc.get("entryMinRatedGames", 0),
        entry_min_account_age_days=tournament_doc.get("entryMinAccountAgeDays", 0),
        entry_titled_only=tournament_doc.get("entryTitledOnly", False),
        forbidden_pairings=tournament_doc.get("forbiddenPairings", ""),
        manual_pairings=tournament_doc.get("manualPairings", ""),
        created_by=tournament_doc.get("createdBy", "PyChess"),
        created_at=tournament_doc["createdAt"],
        before_start=tournament_doc.get("beforeStart", 0),
        minutes=tournament_doc["minutes"],
        starts_at=tournament_doc.get("startsAt"),
        name=tournament_doc["name"],
        password=tournament_doc.get("password", ""),
        description=tournament_doc.get("d", ""),
        frequency=tournament_doc.get("fr", ""),
        status=tournament_doc["status"],
        finish_reason=tournament_doc.get("finishReason"),
        with_clock=False,
    )
    tournament.rr_pending_players = set(tournament_doc.get("rrPendingPlayers", []))
    tournament.rr_denied_players = set(tournament_doc.get("rrDeniedPlayers", []))
    if stored_round is not None:
        tournament.current_round = stored_round
    tournament.pairing_in_progress_round = pairing_in_progress_round

    app_state.tournaments[tournament_id] = tournament
    app_state.tourneysockets[tournament_id] = {}

    tournament.winner = tournament_doc.get("winner", "")

    player_table = app_state.db.tournament_player
    cursor = player_table.find({"tid": tournament_id})
    nb_players = 0

    def _rating_and_provisional(raw_rating: str | int) -> tuple[int, str]:
        if isinstance(raw_rating, int):
            return (raw_rating, "")

        rating_text = str(raw_rating)
        provisional = "?" if rating_text.endswith("?") else ""
        if provisional:
            rating_text = rating_text[:-1]

        try:
            return (int(rating_text), provisional)
        except ValueError:
            return (1500, provisional)

    async def ensure_pairing_participant(username: str, raw_rating: str | int) -> User:
        player = tournament.get_player_by_name(username)
        if player is not None:
            return player

        user = await app_state.users.get(username)
        if user.username != username:
            # Missing user doc (for example hard-deleted account): keep pairing replay usable.
            user = User(app_state, username=username, enabled=False)
            app_state.users[username] = user

        rating, provisional = _rating_and_provisional(raw_rating)
        player_data = PlayerData(user.title, user.username, rating, provisional)
        if tournament.status == T_STARTED:
            # A recovered participant in an already started tournament must not be auto-paired.
            player_data.paused = True
        tournament.register_player(user, player_data)

        if tournament.leaderboard_player_by_username(username) is None:
            tournament.leaderboard.setdefault(user, 0)
            tournament.nb_players += 1

        log.warning(
            "Recovered missing tournament participant %s in %s from pairing history",
            username,
            tournament_id,
        )
        return user

    if tournament.status == T_CREATED:
        try:
            cursor.sort("r", -1)
        except AttributeError:
            log.exception(
                "A unittest MagickMock cursor object"
            )  # todo: logic here shouldnt depend on unit tests

    async for doc in cursor:
        player_doc: TournamentPlayerDoc = doc
        uid = player_doc["uid"]
        if uid.startswith(TEST_PREFIX):
            user = User(app_state, username=uid, title="TEST")
            app_state.users[user.username] = user
        else:
            user = await app_state.users.get(uid)
            if user.username != uid:
                user = User(app_state, username=uid, enabled=False)
                app_state.users[uid] = user

        withdrawn = player_doc.get("wd", False)

        player_data = PlayerData(user.title, user.username, player_doc["r"], player_doc["pr"])
        tournament.register_player(user, player_data)
        player_data.id = player_doc["_id"]
        player_data.paused = player_doc["a"]
        player_data.withdrawn = withdrawn
        normalized_points: list[TournamentPoint] = []
        for point in player_doc["p"]:
            if isinstance(point, list) and len(point) == 2:
                normalized_points.append(cast(TournamentPoint, (point[0], point[1])))
            else:
                normalized_points.append(cast(TournamentPoint, point))
        player_data.points = normalized_points
        if tournament.system == SWISS:
            player_data.joined_round = player_doc["jr"]
        else:
            player_data.joined_round = player_doc.get("jr", 1)
        player_data.nb_win = player_doc["w"]
        player_data.nb_berserk = player_doc.get("b", 0)
        player_data.performance = player_doc["e"]
        player_data.berger = player_doc.get("g", 0)
        player_data.win_streak = player_doc["f"]

        if not withdrawn:
            tie_break = (
                player_data.performance if tournament.system == ARENA else player_data.berger
            )
            tournament.leaderboard.update({user: SCORE_SHIFT * (player_doc["s"]) + tie_break})
            nb_players += 1

        if auto_play and tournament.status in (T_CREATED, T_STARTED):
            user.tournament_sockets[tournament.id] = set((None,))
            await tournament.join(user)

    tournament.nb_players = nb_players

    # tournament.print_leaderboard()

    pairing_table = app_state.db.tournament_pairing
    cursor = pairing_table.find({"tid": tournament_id})
    try:
        cursor.sort("d", 1)
    except AttributeError:
        log.exception(
            "A unittest MagickMock cursor object"
        )  # todo: logic here shouldn't depend on unit tests

    w_win, b_win, draw, berserk = 0, 0, 0, 0
    async for doc in cursor:
        pairing_doc: TournamentPairingDoc = doc
        pair_status = pairing_doc.get("s")
        pair_round = pairing_doc.get("rn")
        if tournament.system == SWISS and pair_round is None:
            raise RuntimeError(
                "Swiss pairing %s in %s is missing required round metadata"
                % (pairing_doc["_id"], tournament_id)
            )

        bye_token = pairing_doc.get("bt")
        _id = pairing_doc["_id"]
        wp, bp = pairing_doc["u"]
        wrating = pairing_doc["wr"]
        brating = pairing_doc["br"]
        date = pairing_doc["d"]

        if pair_status == BYEGAME:
            if tournament.system == SWISS:
                if bye_token is None:
                    raise RuntimeError(
                        "Swiss bye pairing %s in %s is missing required bye token"
                        % (_id, tournament_id)
                    )
            else:
                bye_token = "U"
            assert bye_token is not None
            bye_player = await ensure_pairing_participant(wp, wrating)
            bye_player_data = tournament.player_data_by_name(bye_player.username)
            if bye_player_data is not None:
                bye_game = ByeGame(token=bye_token, round_no=pair_round)
                bye_game.date = date
                bye_player_data.games.append(bye_game)
            continue

        res = pairing_doc["r"]
        result = C2R.get(res)
        if result is None:
            log.warning(
                "Skipping pairing %s in %s with unknown result code %s",
                _id,
                tournament_id,
                res,
            )
            continue
        # Skip aborted/unfinished games if tournament is over
        if result == "*" and tournament.status in (T_ABORTED, T_FINISHED, T_ARCHIVED):
            continue

        wberserk = pairing_doc.get("wb", False)
        bberserk = pairing_doc.get("bb", False)
        pair_ply = pairing_doc.get("p")

        game = None
        if tournament.status in (T_CREATED, T_STARTED) and result == "*":
            game = await load_game(app_state, _id)
            if game is None:
                continue
            if TYPE_CHECKING:
                assert isinstance(game, Game)
            game.round = pair_round  # type: ignore[attr-defined]
            if game.status > STARTED and game.result != "*":
                result = game.result
                res = R2C[result]
                wberserk = game.wberserk
                bberserk = game.bberserk
                wplayer = await ensure_pairing_participant(game.wplayer.username, game.wrating)
                bplayer = await ensure_pairing_participant(game.bplayer.username, game.brating)
                game = GameData(
                    game.id,
                    wplayer.username,
                    game.wrating,
                    bplayer.username,
                    game.brating,
                    result,
                    game.date,
                    wberserk,
                    bberserk,
                    wtitle=wplayer.title,
                    btitle=bplayer.title,
                    status=game.status,
                    ply=game.board.ply,
                    round_no=pair_round,
                )
                tournament.nb_games_finished += 1
                await tournament.db_update_pairing(game)
            else:
                tournament.ongoing_games.add(game)
                tournament.update_game_ranks(game)
        if game is None:
            wplayer = await ensure_pairing_participant(wp, wrating)
            bplayer = await ensure_pairing_participant(bp, brating)
            game = GameData(
                _id,
                wplayer.username,
                wrating,
                bplayer.username,
                brating,
                result,
                date,
                wberserk,
                bberserk,
                wtitle=wplayer.title,
                btitle=bplayer.title,
                status=pair_status,
                ply=pair_ply,
                round_no=pair_round,
            )
            tournament.nb_games_finished += 1

        if res == "a":
            w_win += 1
        elif res == "b":
            b_win += 1
        elif res == "c":
            draw += 1

        if wberserk:
            berserk += 1
        if bberserk:
            berserk += 1

        tournament.update_players(game)

    tournament.w_win = w_win
    tournament.b_win = b_win
    tournament.draw = draw
    tournament.nb_berserk = berserk

    for player_data in tournament.players.values():
        _align_player_games_with_points(player_data)

    if tournament.system == SWISS:
        stored_round = await _recover_incomplete_fixed_round_pairing_round(tournament, stored_round)
    if tournament.system == SWISS:
        await _repair_swiss_state_from_history(tournament)

    if tournament.system != ARENA:
        tournament.recalculate_berger_tiebreak()

    if stored_round is None and tournament.system == SWISS:
        stored_round = max(
            (len(player.games) for player in tournament.players.values()),
            default=0,
        )
        if stored_round == 0:
            stored_round = max(
                (len(player.points) for player in tournament.players.values()),
                default=0,
            )
        tournament.current_round = stored_round

    if tournament.system == RR:
        arrangement_table = app_state.db.tournament_arrangement
        arrangement_cursor = arrangement_table.find({"tid": tournament_id})
        arrangement_docs = await arrangement_cursor.to_list(length=None)
        await tournament.load_arrangements(
            [
                cast(TournamentArrangementDoc, arrangement_doc)
                for arrangement_doc in arrangement_docs
            ]
        )

    cursor = app_state.db.tournament_chat.find(
        {"tid": tournament.id},
        projection={
            "_id": 0,
            "type": 1,
            "user": 1,
            "message": 1,
            "room": 1,
            "time": 1,
        },
    )
    docs: list[ChatLine] = await cursor.to_list(length=MAX_CHAT_LINES)
    tournament.tourneychat = docs

    if tournament.status == T_STARTED:
        has_points = any(player.points for player in tournament.players.values())
        if (
            tournament.nb_games_finished == 0
            and len(tournament.ongoing_games) == 0
            and not has_points
        ):
            tournament.first_pairing = True

    if tournament.status in (T_CREATED, T_STARTED):
        tournament.clock_task = asyncio.create_task(tournament.clock(), name="tournament-clock")

    app_state.schedule_tournament_cache_removal(tournament)
    return tournament


def translated_tournament_name(
    variant: str,
    frequency: str,
    system: int,
    lang_translation: Translation,
) -> str:
    # Weekly makruk category == SEAturday
    frequency = "S" if variant in CATEGORIES["makruk"] and frequency == "m" else frequency
    if frequency == "s":
        return "%s %s %s" % (
            lang_translation.gettext(ALL_VARIANTS[variant].translated_name),
            lang_translation.gettext(TRANSLATED_FREQUENCY_NAMES[frequency]),
            lang_translation.gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system]),
        )
    else:
        return "%s %s %s" % (
            lang_translation.gettext(TRANSLATED_FREQUENCY_NAMES[frequency]),
            lang_translation.gettext(ALL_VARIANTS[variant].translated_name),
            lang_translation.gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system]),
        )
