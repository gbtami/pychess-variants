from datetime import datetime, timezone

from compress import R2C
from const import MATE
from tournament import SCORE_SHIFT
from tournaments import load_tournament
from utils import load_game


def performance(user, games):
    perf = 0
    for game in games:
        print(
            "   ",
            game.wplayer.username,
            game.bplayer.username,
            game.result,
            game.white_rating.rating_prov[0],
            game.black_rating.rating_prov[0],
        )
        if game.wplayer.username == user.username:
            if game.result == "1-0":
                print("WIN  +", game.black_rating.rating_prov[0] + 500)
                perf += game.black_rating.rating_prov[0] + 500
            else:
                print("LOSE +", game.black_rating.rating_prov[0] + 500)
                perf += game.black_rating.rating_prov[0] - 500
        else:
            if game.result == "0-1":
                print("WIN  +", game.white_rating.rating_prov[0] + 500)
                perf += game.white_rating.rating_prov[0] + 500
            else:
                print("LOSE +", game.white_rating.rating_prov[0] + 500)
                perf += game.white_rating.rating_prov[0] - 500
        print("   ", perf)
    return perf


async def fix_first_minishogi_arena(app):
    db = app["db"]
    users = app["users"]
    tid = "4RP5KEl8"  # First Minishogi Arena
    t = await load_tournament(app, tid)
    print(t)

    ubdip = users["ubdip"]
    Diwaditya = users["Diwaditya"]

    print(t.players[ubdip].points)
    print(t.players[Diwaditya].points)

    if t.players[ubdip].points[-1] != "*":
        print("Nothing to do. Aready fixed.")
        return

    game_id = "sbsG6jXn"
    g = await load_game(app, game_id)
    app["games"][game_id] = g

    g.result = "1-0"
    g.status = MATE
    g.wrdiff = 0
    g.brdiff = 0

    t.players[Diwaditya].games[-2].result = "1-0"

    # Fix ubdip
    perf = performance(ubdip, t.players[ubdip].games[:-1])
    # Latest game played against Diwaditya
    perf += 1382 + 500
    nb_games = len(t.players[ubdip].games)

    perf = int(round(perf / nb_games, 0))
    t.leaderboard.update({ubdip: (SCORE_SHIFT * 28) + perf})

    t.players[ubdip].performance = perf
    t.players[ubdip].points[-1] = [2, 2]
    t.players[ubdip].points[-2] = [2, 2]
    t.players[ubdip].rating = 1501 + 322
    t.players[ubdip].nb_games = 11
    t.players[ubdip].nb_win = 9

    # Fix Diwaditya
    perf = performance(Diwaditya, t.players[Diwaditya].games)
    nb_games = len(t.players[Diwaditya].games)
    perf = int(round(perf / nb_games, 0))
    t.leaderboard.update({Diwaditya: (SCORE_SHIFT * 6) + perf})

    t.players[Diwaditya].performance = perf
    t.players[Diwaditya].points[-2] = [0, 1]
    t.players[Diwaditya].points[-3] = [0, 1]
    t.players[Diwaditya].rating = 1367 - 209
    t.players[Diwaditya].nb_games = 10
    t.players[Diwaditya].nb_win = 3

    t.print_leaderboard()

    # fix tournament player ubdip
    await t.db_update_player(ubdip, t.players[ubdip])

    # fix tournament player Diwaditya
    await t.db_update_player(Diwaditya, t.players[Diwaditya])

    # fix game
    await db.game.find_one_and_update(
        {"_id": game_id},
        {
            "$set": {
                "s": MATE,
                "r": R2C["1-0"],
                "p0": {"e": "1823?", "d": 0},
                "p1": {"e": "1382", "d": 0},
            }
        },
    )

    # fix ubdip
    doc = await db.user.find_one({"_id": "ubdip"})
    perfs = doc.get("perfs")

    la = "2021-07-17T16:07:59.405Z"
    la = datetime.fromisoformat(la[:-1]).replace(tzinfo=timezone.utc)
    minishogi = {"la": la, "nb": 13, "gl": {"r": 1501 + 322, "d": 315, "v": 0.06}}
    perfs["minishogi"] = minishogi
    users["ubdip"].perfs = perfs
    await db.user.find_one_and_update({"_id": "ubdip"}, {"$set": {"perfs": perfs}})

    # fix Diwaditya
    doc = await db.user.find_one({"_id": "Diwaditya"})
    perfs = doc.get("perfs")
    la = "2021-07-17T16:10:37.330Z"
    la = datetime.fromisoformat(la[:-1]).replace(tzinfo=timezone.utc)
    minishogi = {"la": la, "nb": 35, "gl": {"r": 1367 - 209, "d": 252, "v": 0.06}}
    perfs["minishogi"] = minishogi
    users["Diwaditya"].perfs = perfs
    await db.user.find_one_and_update({"_id": "Diwaditya"}, {"$set": {"perfs": perfs}})
