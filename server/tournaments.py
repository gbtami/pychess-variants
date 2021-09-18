import collections
import logging
from datetime import datetime, timezone

from compress import C2V, V2C, C2R
from const import CASUAL, RATED, ARENA, RR, SWISS, variant_display_name, T_STARTED, T_CREATED, T_FINISHED, T_ARCHIVED, SHIELD, VARIANTS, MAX_CHAT_LINES
from newid import new_id
from user import User

from tournament import GameData, PlayerData, SCORE_SHIFT
from arena import ArenaTournament
from rr import RRTournament
from swiss import SwissTournament
from settings import ADMINS
from misc import time_control_str

log = logging.getLogger(__name__)


async def create_or_update_tournament(app, username, form, tournament=None):
    variant = form["variant"]
    variant960 = variant.endswith("960")
    variant_name = variant[:-3] if variant960 else variant
    rated = form.get("rated", "") == "1" and form["position"] == ""
    base = float(form["clockTime"])
    inc = int(form["clockIncrement"])
    bp = int(form["byoyomiPeriod"])
    frequency = SHIELD if form["shield"] == "true" else ""

    if form["startDate"]:
        start_date = datetime.fromisoformat(form["startDate"].rstrip("Z")).replace(tzinfo=timezone.utc)
    else:
        start_date = None

    name = form["name"]
    # Create meningful tournament name in case we forget to change it :)
    if name in ADMINS:
        name = "%s %s Arena" % (variant_display_name(variant).title(), time_control_str(base, inc, bp))

    if frequency == SHIELD:
        name = "%s Shield Arena" % variant_display_name(variant).title()
        description = """
This Shield trophy is unique.
The winner keeps it for one month,
then must defend it during the next %s Shield tournament!
""" % variant_display_name(variant).title()
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
        tournament = await new_tournament(app, data)
    else:
        # We want to update some data of the tournament created by new_tournament() befor
        # upsert=True will do this update at the end of upsert_tournament_to_db()
        await upsert_tournament_to_db(tournament, app)

    await tournament.broadcast_spotlight()

    # Send msg to discord-relay BOT
    try:
        lobby_sockets = app["lobbysockets"]
        msg = tournament.discord_msg
        for dr_ws in lobby_sockets["Discord-Relay"]:
            await dr_ws.send_json({"type": "create_tournament", "message": msg})
            break
    except (KeyError, ConnectionResetError):
        # BOT disconnected
        log.error("--- Discord-Relay disconnected!")


async def new_tournament(app, data):
    if "tid" not in data:
        tid = await new_id(app["db"].tournament)
    else:
        tid = data["tid"]

    if data["system"] == ARENA:
        tournament_class = ArenaTournament
    elif data["system"] == SWISS:
        tournament_class = SwissTournament
    elif data["system"] == RR:
        tournament_class = RRTournament

    tournament = tournament_class(
        app, tid,
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
        description=data["description"],
        created_at=data.get("createdAt"),
        status=data.get("status"),
        with_clock=data.get("with_clock", True)
    )

    app["tournaments"][tid] = tournament
    app["tourneysockets"][tid] = {}
    app["tourneychat"][tid] = collections.deque([], MAX_CHAT_LINES)

    await upsert_tournament_to_db(tournament, app)

    return tournament


async def upsert_tournament_to_db(tournament, app):
    # unit test app may have no db
    if app["db"] is None:
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
        await app["db"].tournament.find_one_and_update({"_id": tournament.id}, {"$set": new_data}, upsert=True)
    except Exception:
        if app["db"] is not None:
            log.error("Failed to save tournament data to mongodb!")


async def get_winners(app, shield):
    wi = {}

    for variant in VARIANTS:
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
        cursor = app["db"].tournament.find(filter_cond, sort=[("startsAt", -1)], limit=5)
        async for doc in cursor:
            print("---", doc)
            winners.append((doc["winner"], doc["startsAt"].strftime("%Y.%m.%d"), doc["_id"]))

        wi[variant] = winners

    return wi


async def get_latest_tournaments(app):
    tournaments = app["tournaments"]
    started, scheduled, completed = [], [], []

    cursor = app["db"].tournament.find()
    cursor.sort('startsAt', -1)
    nb_tournament = 0
    async for doc in cursor:
        nb_tournament += 1
        if nb_tournament > 20:
            break

        tid = doc["_id"]
        if tid in tournaments:
            tournament = tournaments[tid]
        else:
            if doc["system"] == ARENA:
                tournament_class = ArenaTournament
            elif doc["system"] == SWISS:
                tournament_class = SwissTournament
            elif doc["system"] == RR:
                tournament_class = RRTournament

            tournament = tournament_class(
                app, tid, C2V[doc["v"]],
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
                with_clock=False
            )
            tournament.nb_players = doc["nbPlayers"]

        if doc["status"] == T_STARTED:
            started.append(tournament)
        elif doc["status"] < T_STARTED:
            scheduled.append(tournament)
        elif doc["status"] > T_STARTED:
            completed.append(tournament)

    return (started, scheduled, completed)


async def load_tournament(app, tournament_id):
    """ Return Tournament object from app cache or from database """
    db = app["db"]
    users = app["users"]
    tournaments = app["tournaments"]
    if tournament_id in tournaments:
        return tournaments[tournament_id]

    doc = await db.tournament.find_one({"_id": tournament_id})

    if doc is None:
        return None

    if doc["system"] == ARENA:
        tournament_class = ArenaTournament
    elif doc["system"] == SWISS:
        tournament_class = SwissTournament
    elif doc["system"] == RR:
        tournament_class = RRTournament

    tournament = tournament_class(
        app, doc["_id"], C2V[doc["v"]],
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
        frequency=doc.get("fr", False),
        status=doc["status"],
    )

    tournaments[tournament_id] = tournament
    app["tourneysockets"][tournament_id] = {}
    app["tourneychat"][tournament_id] = collections.deque([], MAX_CHAT_LINES)

    tournament.nb_games_finished = doc.get("nbGames", 0)
    tournament.winner = doc.get("winner", "")

    player_table = app["db"].tournament_player
    cursor = player_table.find({"tid": tournament_id})
    nb_players = 0

    if tournament.status == T_CREATED:
        cursor.sort('r', -1)

    async for doc in cursor:
        uid = doc["uid"]
        if uid in users:
            user = users[uid]
        else:
            user = User(app, username=uid, title="TEST" if tournament_id == "12345678" else "")
            users[uid] = user

        withdrawn = doc.get("wd", False)

        tournament.players[user] = PlayerData(doc["r"], doc["pr"])
        tournament.players[user].id = doc["_id"]
        tournament.players[user].paused = doc["a"]
        tournament.players[user].withdrawn = withdrawn
        tournament.players[user].points = doc["p"]
        tournament.players[user].nb_games = doc["g"]
        tournament.players[user].nb_win = doc["w"]
        tournament.players[user].performance = doc["e"]

        if not withdrawn:
            tournament.leaderboard.update({user: SCORE_SHIFT * (doc["s"]) + doc["e"]})
            nb_players += 1

    tournament.nb_players = nb_players

    tournament.print_leaderboard()

    pairing_table = app["db"].tournament_pairing
    cursor = pairing_table.find({"tid": tournament_id})
    cursor.sort('d', 1)

    w_win, b_win, draw = 0, 0, 0
    async for doc in cursor:
        res = doc["r"]
        _id = doc["_id"]
        result = C2R[res]
        wp, bp = doc["u"]
        wrating = doc["wr"]
        brating = doc["br"]
        date = doc["d"]

        game_data = GameData(_id, users[wp], wrating, users[bp], brating, result, date)

        tournament.players[users[wp]].games.append(game_data)
        tournament.players[users[bp]].games.append(game_data)

        if res == "a":
            w_win += 1
        elif res == "b":
            b_win += 1
        elif res == "c":
            draw += 1

    tournament.w_win = w_win
    tournament.b_win = b_win
    tournament.draw = draw

    return tournament
