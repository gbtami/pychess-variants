import collections

from compress import C2V, V2C, C2R
from const import CASUAL, RATED, ARENA, RR, SWISS
from newid import new_id
from user import User

from tournament import GameData, PlayerData, SCORE_SHIFT
from arena import ArenaTournament
from rr import RRTournament
from swiss import SwissTournament


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
        byoyomi_period=data["bp"],
        rated=data["rated"],
        chess960=data["chess960"],
        fen=data["fen"],
        rounds=data["rounds"],
        created_by=data["createdBy"],
        before_start=data["beforeStart"],
        minutes=data["minutes"],
        name=data["name"],
        created_at=data.get("createdAt"),
        status=data.get("status")
    )

    app["tournaments"][tid] = tournament
    app["tourneysockets"][tid] = {}
    app["tourneychat"][tid] = collections.deque([], 100)

    await insert_tournament_to_db(tournament, app)

    return {"type": "new_tournament", "tournamentId": tid}


async def insert_tournament_to_db(tournament, app):
    # unit test app may have no db
    if app["db"] is None:
        return

    document = {
        "_id": tournament.id,
        "name": tournament.name,
        "minutes": tournament.minutes,
        "v": V2C[tournament.variant],
        "b": tournament.base,
        "i": tournament.inc,
        "bp": tournament.byoyomi_period,
        "f": tournament.fen,
        "s": tournament.status,
        "y": RATED if tournament.rated else CASUAL,
        "z": int(tournament.chess960),
        "system": tournament.system,
        "rounds": tournament.rounds,
        "nbPlayers": 0,
        "createdBy": tournament.created_by,
        "cretaedAt": tournament.created_at,
        "startsAt": tournament.starts_at,
        "status": tournament.status,
    }

    result = await app["db"].tournament.insert_one(document)
    print("db insert tournament result %s" % repr(result.inserted_id))


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

    variant = C2V[doc["v"]]

    if doc["system"] == ARENA:
        tournament_class = ArenaTournament
    elif doc["system"] == SWISS:
        tournament_class = SwissTournament
    elif doc["system"] == RR:
        tournament_class = RRTournament

    tournament = tournament_class(
        app, tournament_id, variant,
        base=doc["b"],
        inc=doc["i"],
        byoyomi_period=int(bool(doc.get("bp"))),
        rated=doc.get("y"),
        chess960=bool(doc.get("z")),
        fen=doc.get("f"),
        rounds=doc["rounds"],
        created_by=doc["createdBy"],
        minutes=doc["minutes"],
        name=doc["name"],
        status=doc["status"],
    )

    tournaments[tournament_id] = tournament
    app["tourneysockets"][tournament_id] = {}
    app["tourneychat"][tournament_id] = collections.deque([], 100)

    tournament.nb_players = doc["nbPlayers"]
    tournament.nb_games_finished = doc["nbGames"]
    tournament.winner = doc["winner"]

    player_table = app["db"].tournament_player
    cursor = player_table.find({"tid": tournament_id})

    async for doc in cursor:
        uid = doc["uid"]
        if uid in users:
            user = users[uid]
        else:
            user = User(app, username=uid, title="TEST" if tournament_id == "12345678" else "")
            users[uid] = user

        tournament.players[user] = PlayerData(doc["r"], doc["pr"])
        tournament.players[user].points = doc["p"]
        tournament.players[user].nb_games = doc["g"]
        tournament.players[user].nb_win = doc["w"]
        tournament.players[user].performance = doc["e"]
        tournament.leaderboard.update({user: SCORE_SHIFT * (doc["s"]) + doc["e"]})

    pairing_table = app["db"].tournament_pairing
    cursor = pairing_table.find({"tid": tournament_id})

    async for doc in cursor:
        _id = doc["_id"]
        result = C2R[doc["r"]]
        wp, bp = doc["u"]
        wrating = doc["wr"]
        brating = doc["br"]
        date = doc["d"]

        game_data = GameData(_id, users[wp], wrating, users[bp], brating, result, date)

        tournament.players[users[wp]].games.append(game_data)
        tournament.players[users[bp]].games.append(game_data)

    return tournament
