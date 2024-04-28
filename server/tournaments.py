from __future__ import annotations
import collections
import logging
from datetime import datetime, timezone

import aiohttp_session

from arena import ArenaTournament
from compress import C2V, V2C, C2R
from const import (
    CASUAL,
    RATED,
    ARENA,
    RR,
    SWISS,
    variant_display_name,
    T_STARTED,
    T_CREATED,
    T_ABORTED,
    T_FINISHED,
    T_ARCHIVED,
    SHIELD,
    VARIANTS,
    MAX_CHAT_LINES,
    CATEGORIES,
    TRANSLATED_FREQUENCY_NAMES,
    TRANSLATED_PAIRING_SYSTEM_NAMES,
    TRANSLATED_VARIANT_NAMES,
)
from newid import new_id
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from rr import RRTournament
from swiss import SwissTournament
from tournament import GameData, PlayerData, SCORE_SHIFT, Tournament

log = logging.getLogger(__name__)


async def create_or_update_tournament(
    app_state: PychessGlobalAppState, username, form, tournament=None
):
    """Manual tournament creation from https://www.pychess.org/tournaments/new form input values"""

    variant = form["variant"]
    variant960 = variant.endswith("960")
    variant_name = variant[:-3] if variant960 else variant
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
        name = "%s Arena" % variant_display_name(variant).title()

    if frequency == SHIELD:
        name = "%s Shield Arena" % variant_display_name(variant).title()
    else:
        description = form["description"]

    data = {
        "name": name,
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
        await upsert_tournament_to_db(tournament, app_state)

    await broadcast_tournament_creation(app_state, tournament)


async def broadcast_tournament_creation(app_state: PychessGlobalAppState, tournament):
    await tournament.broadcast_spotlight()
    await app_state.discord.send_to_discord("create_tournament", tournament.create_discord_msg)


async def new_tournament(app_state: PychessGlobalAppState, data):
    if "tid" not in data:
        tid = await new_id(app_state.db.tournament)
    else:
        tid = data["tid"]

    if data["system"] == ARENA:
        tournament_class: type[Tournament] = ArenaTournament
    elif data["system"] == SWISS:
        tournament_class: type[Tournament] = SwissTournament
    elif data["system"] == RR:
        tournament_class: type[Tournament] = RRTournament

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
        description=data.get("description", ""),
        created_at=data.get("createdAt"),
        status=data.get("status"),
        with_clock=data.get("with_clock", True),
    )

    app_state.tournaments[tid] = tournament
    app_state.tourneysockets[tid] = {}
    app_state.tourneychat[tid] = collections.deque([], MAX_CHAT_LINES)

    await upsert_tournament_to_db(tournament, app_state)

    return tournament


async def upsert_tournament_to_db(tournament, app_state: PychessGlobalAppState):
    # unit test app may have no db
    if app_state.db is None:
        return

    new_data = {
        "name": tournament.name,
        "d": tournament.description,
        "fr": tournament.frequency,
        "minutes": tournament.minutes,
        "v": V2C[tournament.variant],
        "b": tournament.base,
        "i": tournament.inc,
        "bp": tournament.byoyomi_period,
        "f": tournament.fen,
        "y": RATED if tournament.rated else CASUAL,
        "z": int(tournament.chess960),
        "system": tournament.system,
        "rounds": tournament.rounds,
        "nbPlayers": 0,
        "createdBy": tournament.created_by,
        "createdAt": tournament.created_at,
        "beforeStart": tournament.before_start,
        "startsAt": tournament.starts_at,
        "status": tournament.status,
    }

    try:
        await app_state.db.tournament.find_one_and_update(
            {"_id": tournament.id}, {"$set": new_data}, upsert=True
        )
    except Exception:
        log.error("Failed to save tournament data to mongodb!", exc_info=True)


async def get_winners(app_state: PychessGlobalAppState, shield, variant: str = None):
    wi = {}
    if variant is None:
        variants = VARIANTS
        limit = 5
    else:
        variants = (variant,)
        limit = 50

    for variant in variants:
        if variant.endswith("960"):
            v = variant[:-3]
            z = 1
        else:
            v = variant
            z = 0

        filter_cond = {"v": V2C[v], "z": z, "status": {"$in": [T_FINISHED, T_ARCHIVED]}}
        if shield:
            filter_cond["fr"] = SHIELD

        winners = []
        cursor = app_state.db.tournament.find(filter_cond, sort=[("startsAt", -1)], limit=limit)
        async for doc in cursor:
            if "winner" in doc:
                winners.append((doc["winner"], doc["startsAt"].strftime("%Y.%m.%d"), doc["_id"]))
                await app_state.users.get(doc["winner"])

        wi[variant] = winners

    return wi


async def get_scheduled_tournaments(app_state: PychessGlobalAppState, nb_max=30):
    """Return max 30 already scheduled tournaments from mongodb"""
    cursor = app_state.db.tournament.find({"$or": [{"status": T_STARTED}, {"status": T_CREATED}]})
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    tournaments = []

    async for doc in cursor:
        if (
            doc["status"] in (T_CREATED, T_STARTED)
            and doc["createdBy"] == "PyChess"
            and doc.get("fr", "") != ""
        ):
            nb_tournament += 1
            if nb_tournament > nb_max:
                break
            else:
                tournaments.append(
                    (
                        doc["fr"],
                        C2V[doc["v"]],
                        bool(doc["z"]),
                        doc["startsAt"],
                        doc["minutes"],
                        doc["_id"],
                    )
                )
    return tournaments


async def get_latest_tournaments(app_state: PychessGlobalAppState, lang):
    started, scheduled, completed = [], [], []

    cursor = app_state.db.tournament.find()
    cursor.sort("startsAt", -1)
    nb_tournament = 0
    async for doc in cursor:
        nb_tournament += 1
        if nb_tournament > 31:
            break

        tid = doc["_id"]
        if tid in app_state.tournaments:
            tournament = app_state.tournaments[tid]
        else:
            if doc["system"] == ARENA:
                tournament_class: type[Tournament] = ArenaTournament
            elif doc["system"] == SWISS:
                tournament_class: type[Tournament] = SwissTournament
            elif doc["system"] == RR:
                tournament_class: type[Tournament] = RRTournament

            tournament = tournament_class(
                app_state,
                tid,
                C2V[doc["v"]],
                base=doc["b"],
                inc=doc["i"],
                byoyomi_period=int(bool(doc.get("bp"))),
                rated=doc.get("y"),
                chess960=bool(doc.get("z")),
                fen=doc.get("f"),
                rounds=doc["rounds"],
                created_by=doc["createdBy"],
                created_at=doc["createdAt"],
                minutes=doc["minutes"],
                starts_at=doc.get("startsAt"),
                name=doc["name"],
                description=doc.get("d", ""),
                frequency=doc.get("fr", ""),
                status=doc["status"],
                with_clock=False,
            )
            tournament.nb_players = doc["nbPlayers"]

        if tournament.frequency:
            tournament.translated_name = app_state.tourneynames[lang][
                (
                    tournament.variant + ("960" if tournament.chess960 else ""),
                    tournament.frequency,
                    tournament.system,
                )
            ]
        else:
            tournament.translated_name = tournament.name

        if doc["status"] == T_STARTED:
            started.append(tournament)
        elif doc["status"] < T_STARTED:
            scheduled.append(tournament)
        elif doc["status"] > T_STARTED:
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
            name = app_state.tourneynames[lang][
                (
                    tournament.variant + ("960" if tournament.chess960 else ""),
                    tournament.frequency,
                    tournament.system,
                )
            ]
        else:
            name = tournament.name
    else:
        doc = await app_state.db.tournament.find_one({"_id": tournament_id})
        if doc is not None:
            frequency = doc.get("fr", "")
            if frequency:
                chess960 = bool(doc.get("z"))
                name = app_state.tourneynames[lang][
                    (
                        C2V[doc["v"]] + ("960" if chess960 else ""),
                        frequency,
                        doc["system"],
                    )
                ]
            else:
                name = doc["name"]
        app_state.tourneynames[lang][tournament_id] = name

    return name


async def load_tournament(app_state: PychessGlobalAppState, tournament_id, tournament_klass=None):
    """Return Tournament object from app cache or from database"""
    if tournament_id in app_state.tournaments:
        return app_state.tournaments[tournament_id]

    doc = await app_state.db.tournament.find_one({"_id": tournament_id})

    if doc is None:
        return None

    if doc["system"] == ARENA:
        tournament_class = ArenaTournament
    elif doc["system"] == SWISS:
        tournament_class = SwissTournament
    elif doc["system"] == RR:
        tournament_class = RRTournament
    elif tournament_klass is not None:
        tournament_class = tournament_klass

    tournament = tournament_class(
        app_state,
        doc["_id"],
        C2V[doc["v"]],
        base=doc["b"],
        inc=doc["i"],
        byoyomi_period=int(bool(doc.get("bp"))),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        fen=doc.get("f"),
        rounds=doc["rounds"],
        created_by=doc["createdBy"],
        created_at=doc["createdAt"],
        before_start=doc.get("beforeStart", 0),
        minutes=doc["minutes"],
        starts_at=doc.get("startsAt"),
        name=doc["name"],
        description=doc.get("d", ""),
        frequency=doc.get("fr", ""),
        status=doc["status"],
    )

    app_state.tournaments[tournament_id] = tournament
    app_state.tourneysockets[tournament_id] = {}
    app_state.tourneychat[tournament_id] = collections.deque([], MAX_CHAT_LINES)

    tournament.winner = doc.get("winner", "")

    player_table = app_state.db.tournament_player
    cursor = player_table.find({"tid": tournament_id})
    nb_players = 0

    if tournament.status == T_CREATED:
        try:
            cursor.sort("r", -1)
        except AttributeError:
            print("A unittest MagickMock cursor object")

    async for doc in cursor:
        uid = doc["uid"]
        user = await app_state.users.get(uid)

        withdrawn = doc.get("wd", False)

        tournament.players[user] = PlayerData(doc["r"], doc["pr"])
        tournament.players[user].id = doc["_id"]
        tournament.players[user].paused = doc["a"]
        tournament.players[user].withdrawn = withdrawn
        tournament.players[user].points = doc["p"]
        tournament.players[user].nb_games = doc["g"]
        tournament.players[user].nb_win = doc["w"]
        tournament.players[user].nb_berserk = doc.get("b", 0)
        tournament.players[user].performance = doc["e"]
        tournament.players[user].win_streak = doc["f"]

        if not withdrawn:
            tournament.leaderboard.update({user: SCORE_SHIFT * (doc["s"]) + doc["e"]})
            nb_players += 1

    tournament.nb_players = nb_players

    # tournament.print_leaderboard()

    pairing_table = app_state.db.tournament_pairing
    cursor = pairing_table.find({"tid": tournament_id})
    try:
        cursor.sort("d", 1)
    except AttributeError:
        print("A unittest MagickMock cursor object")

    w_win, b_win, draw, berserk = 0, 0, 0, 0
    async for doc in cursor:
        res = doc["r"]
        result = C2R[res]
        # Skip aborted/unfinished games
        if result == "*" and tournament.status in (T_ABORTED, T_FINISHED, T_ARCHIVED):
            continue

        _id = doc["_id"]
        wp, bp = doc["u"]
        wrating = doc["wr"]
        brating = doc["br"]
        date = doc["d"]
        wberserk = doc.get("wb", False)
        bberserk = doc.get("bb", False)

        game_data = GameData(
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

        tournament.players[app_state.users[wp]].games.append(game_data)
        tournament.players[app_state.users[bp]].games.append(game_data)

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

        tournament.nb_games_finished += 1

    tournament.w_win = w_win
    tournament.b_win = b_win
    tournament.draw = draw
    tournament.nb_berserk = berserk

    return tournament


def translated_tournament_name(variant, frequency, system, lang_translation):
    # Weekly makruk category == SEAturday
    frequency = "S" if variant in CATEGORIES["makruk"] and frequency == "m" else frequency
    if frequency == "s":
        return "%s %s %s" % (
            lang_translation.gettext(TRANSLATED_VARIANT_NAMES[variant]),
            lang_translation.gettext(TRANSLATED_FREQUENCY_NAMES[frequency]),
            lang_translation.gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system]),
        )
    else:
        return "%s %s %s" % (
            lang_translation.gettext(TRANSLATED_FREQUENCY_NAMES[frequency]),
            lang_translation.gettext(TRANSLATED_VARIANT_NAMES[variant]),
            lang_translation.gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system]),
        )
