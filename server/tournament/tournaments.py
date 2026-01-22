from __future__ import annotations
from typing import TYPE_CHECKING, Iterable, Mapping, cast
from datetime import datetime, timezone
import asyncio

import aiohttp_session
import logging

from tournament.arena_new import ArenaTournament
from compress import C2R, R2C
from const import (
    ARENA,
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
)
from newid import new_id

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from game import Game
from pychess_global_app_state_utils import get_app_state
from tournament.rr import RRTournament
from tournament.swiss import SwissTournament
from tournament.tournament import (
    ByeGame,
    GameData,
    PlayerData,
    SCORE_SHIFT,
    Tournament,
    upsert_tournament_to_db,
)
from tournament.auto_play_arena import ArenaTestTournament, AUTO_PLAY_ARENA_NAME
from typing_defs import (
    TournamentCreateData,
    TournamentDoc,
    TournamentPairingDoc,
    TournamentPlayerDoc,
)
from variants import C2V, get_server_variant, ALL_VARIANTS, VARIANTS
from user import User
from utils import load_game

log = logging.getLogger(__name__)


async def create_or_update_tournament(
    app_state: PychessGlobalAppState,
    username: str,
    form: Mapping[str, str],
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
    frequency = SHIELD if form.get("shield", "") == "true" else ""

    if form["startDate"]:
        start_date = datetime.fromisoformat(form["startDate"].rstrip("Z")).replace(
            tzinfo=timezone.utc
        )
    else:
        start_date = None

    name = form["name"]
    # Create meaningful tournament name in case we forget to change it :)
    if name == "":
        name = "%s Arena" % server_variant.display_name.title()

    description = form["description"]
    if frequency == SHIELD:
        name = "%s Shield Arena" % server_variant.display_name.title()
    else:
        name = name if name.lower().endswith("arena") else name + " Arena"

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
        "system": ARENA,
        "beforeStart": int(form["waitMinutes"]),
        "startDate": start_date,
        "frequency": frequency,
        "minutes": int(form["minutes"]),
        "fen": form["position"],
        "description": description,
    }
    if tournament is None:
        tournament = await new_tournament(app_state, data)
    else:
        # We want to update some data of the tournament created by new_tournament() before.
        # upsert=True will do this update at the end of upsert_tournament_to_db()
        tournament.name = data["name"]
        tournament.password = data["password"]
        tournament.variant = data["variant"]
        tournament.chess960 = data["chess960"]
        tournament.rated = data["rated"]
        tournament.base = data["base"]
        tournament.inc = data["inc"]
        tournament.bp = data["bp"]
        tournament.beforeStart = data["beforeStart"]
        tournament.starts_at = data["startDate"]
        tournament.frequency = data["frequency"]
        tournament.minutes = data["minutes"]
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
        with_clock=data.get("with_clock", True),
    )

    app_state.tournaments[tid] = tournament
    app_state.tourneysockets[tid] = {}

    await upsert_tournament_to_db(tournament, app_state)

    return tournament


async def get_winners(
    app_state: PychessGlobalAppState,
    shield,
    variant: str | None = None,
    variants: Iterable[str] | None = None,
):
    wi = {}
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

        winners = []
        cursor = app_state.db.tournament.find(filter_cond, sort=[("startsAt", -1)], limit=limit)
        async for doc in cursor:
            tournament_doc = cast(TournamentDoc, doc)
            if "winner" in tournament_doc:
                starts_at = cast(datetime, tournament_doc["startsAt"])
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


async def get_scheduled_tournaments(app_state: PychessGlobalAppState, nb_max=30):
    """Return max 30 already scheduled tournaments from mongodb"""
    cursor = app_state.db.tournament.find({"$or": [{"status": T_STARTED}, {"status": T_CREATED}]})
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    tournaments = []

    async for doc in cursor:
        tournament_doc = cast(TournamentDoc, doc)
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


async def get_latest_tournaments(app_state: PychessGlobalAppState, lang):
    started, scheduled, completed = [], [], []

    cursor = app_state.db.tournament.find()
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    async for doc in cursor:
        tournament_doc = cast(TournamentDoc, doc)
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
            else:
                continue

            tournament = tournament_class(
                app_state,
                tid,
                C2V[tournament_doc["v"]],
                base=tournament_doc["b"],
                inc=tournament_doc["i"],
                byoyomi_period=int(bool(tournament_doc.get("bp"))),
                rated=cast(bool, tournament_doc.get("y")),
                chess960=bool(tournament_doc.get("z")),
                fen=tournament_doc.get("f"),
                rounds=tournament_doc["rounds"],
                created_by=tournament_doc["createdBy"],
                created_at=tournament_doc["createdAt"],
                minutes=tournament_doc["minutes"],
                starts_at=tournament_doc.get("startsAt"),
                name=tournament_doc["name"],
                description=tournament_doc.get("d", ""),
                frequency=tournament_doc.get("fr", ""),
                status=tournament_doc["status"],
                with_clock=False,
            )
            tournament.nb_players = tournament_doc["nbPlayers"]

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


async def get_tournament_name(request, tournament_id):
    """Return Tournament name from app cache or from database"""
    app_state = get_app_state(request.app)
    # todo: similar logic for determining lang already exists in index.py, except this "l" param. If it is specific for
    #       when called via the game_api move that there and re-use the rest about session+user from index.py
    #       finally change param of this function to get_tournament_name(app_state, tournament_id, lang)
    lang = request.rel_url.query.get("l")
    if lang is None:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
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
            tournament_doc = cast(TournamentDoc, doc)
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
    tournament_id,
    tournament_klass: type[Tournament] | None = None,
):
    """Return Tournament object from app cache or from database"""
    if tournament_id in app_state.tournaments:
        tournament = app_state.tournaments[tournament_id]
        app_state.schedule_tournament_cache_removal(tournament)
        return tournament

    doc = await app_state.db.tournament.find_one({"_id": tournament_id})

    if doc is None:
        return None

    tournament_doc = cast(TournamentDoc, doc)
    stored_round = tournament_doc.get("cr")

    tournament_class: type[Tournament]
    if tournament_doc["system"] == ARENA:
        tournament_class = ArenaTournament
    elif tournament_doc["system"] == SWISS:
        tournament_class = SwissTournament
    elif tournament_doc["system"] == RR:
        tournament_class = RRTournament
    elif tournament_klass is not None:
        tournament_class = tournament_klass
    else:
        raise ValueError("Unknown tournament system")

    auto_play = tournament_doc["name"] == AUTO_PLAY_ARENA_NAME
    if auto_play:
        tournament_class = ArenaTestTournament

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
        with_clock=False,
    )
    if stored_round is not None:
        tournament.current_round = stored_round

    app_state.tournaments[tournament_id] = tournament
    app_state.tourneysockets[tournament_id] = {}

    tournament.winner = tournament_doc.get("winner", "")

    player_table = app_state.db.tournament_player
    cursor = player_table.find({"tid": tournament_id})
    nb_players = 0

    if tournament.status == T_CREATED:
        try:
            cursor.sort("r", -1)
        except AttributeError:
            log.exception(
                "A unittest MagickMock cursor object"
            )  # todo: logic here shouldnt depend on unit tests

    async for doc in cursor:
        player_doc = cast(TournamentPlayerDoc, doc)
        uid = player_doc["uid"]
        if uid.startswith(TEST_PREFIX):
            user = User(app_state, username=uid, title="TEST")
            app_state.users[user.username] = user
        else:
            user = await app_state.users.get(uid)

        withdrawn = player_doc.get("wd", False)

        tournament.players[user] = PlayerData(
            user.title, user.username, player_doc["r"], player_doc["pr"]
        )
        tournament.players[user].id = player_doc["_id"]
        tournament.players[user].paused = player_doc["a"]
        tournament.players[user].withdrawn = withdrawn
        tournament.players[user].points = player_doc["p"]
        tournament.players[user].nb_win = player_doc["w"]
        tournament.players[user].nb_berserk = player_doc.get("b", 0)
        tournament.players[user].performance = player_doc["e"]
        tournament.players[user].win_streak = player_doc["f"]

        if not withdrawn:
            tournament.leaderboard.update({user: SCORE_SHIFT * (player_doc["s"]) + player_doc["e"]})
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
        pairing_doc = cast(TournamentPairingDoc, doc)
        res = pairing_doc["r"]
        result = C2R[res]
        # Skip aborted/unfinished games if tournament is over
        if result == "*" and tournament.status in (T_ABORTED, T_FINISHED, T_ARCHIVED):
            continue

        _id = pairing_doc["_id"]
        wp, bp = pairing_doc["u"]
        wrating = pairing_doc["wr"]
        brating = pairing_doc["br"]
        date = pairing_doc["d"]
        wberserk = pairing_doc.get("wb", False)
        bberserk = pairing_doc.get("bb", False)

        game = None
        if tournament.status in (T_CREATED, T_STARTED) and result == "*":
            game = await load_game(app_state, _id)
            if game is None:
                continue
            if game.status > STARTED and game.result != "*":
                result = game.result
                res = R2C[result]
                wberserk = game.wberserk
                bberserk = game.bberserk
                game = GameData(
                    game.id,
                    game.wplayer,
                    game.wrating,
                    game.bplayer,
                    game.brating,
                    result,
                    game.date,
                    wberserk,
                    bberserk,
                )
                tournament.nb_games_finished += 1
                await tournament.db_update_pairing(game)
            else:
                tournament.ongoing_games.add(game)
                tournament.update_game_ranks(game)
        if game is None:
            game = GameData(
                _id,
                app_state.users[wp],
                wrating,
                app_state.users[bp],
                brating,
                result,
                date,
                wberserk,
                bberserk,
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
        if "-" not in player_data.points:
            continue
        games_iter = iter(player_data.games)
        next_game = next(games_iter, None)
        rebuilt: list[Game | GameData | ByeGame] = []
        for point in player_data.points:
            if point == "-":
                rebuilt.append(ByeGame())
                continue
            if next_game is None:
                break
            rebuilt.append(next_game)
            next_game = next(games_iter, None)
        while next_game is not None:
            rebuilt.append(next_game)
            next_game = next(games_iter, None)
        player_data.games = rebuilt

    if stored_round is None and tournament.system != ARENA:
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
    docs = await cursor.to_list(length=MAX_CHAT_LINES)
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


def translated_tournament_name(variant, frequency, system, lang_translation):
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
