import asyncio
from collections import namedtuple
from datetime import datetime, timezone

from const import RR
from tournament import T_ARCHIVED
from tournaments import new_tournament
from utils import load_game

GameRecord = namedtuple('GameRecord', 'color, result, id, oppname')

pairings = {}

pairings["borjigin"] = (
    GameRecord("w", "1-0", "wkqJzfGX", "Fairy-Stockfish"),
    GameRecord("w", "1-0", "FUQUvfyq", "Jean-Guy"),
    GameRecord("b", "0-1", "Z1R3ONzo", "timea_katona"),
    GameRecord("b", "0-1", "yp4NVTm9", "Adasko65"),
    GameRecord("b", "1-0", "7OuDyu9R", "Dimarr"),
    GameRecord("w", "0-1", "mJYcBeod", "Totonno_o_coreano"),
    GameRecord("w", "0-1", "eCodKdlu", "ubdip"),
)

pairings["ubdip"] = (
    GameRecord("b", "0-1", "tt2ZVMFD", "Adasko65"),  # VARIANTEND bikjang, point counting
    GameRecord("b", "0-1", "hB935gjd", "Fairy-Stockfish"),
    GameRecord("w", "1-0", "LErk3AUQ", "Totonno_o_coreano"),
    GameRecord("b", "1-0", "IgYr6c86", "Dimarr"),
    GameRecord("w", "1-0", "8y5C66w9", "timea_katona"),
    GameRecord("w", "1-0", "oYnoocKB", "Jean-Guy"),
    GameRecord("b", "0-1", "eCodKdlu", "borjigin"),
)

pairings["Dimarr"] = (
    GameRecord("b", "0-1", "mi44nIL5", "Jean-Guy"),
    GameRecord("b", "0-1", "zWpPPLm6", "timea_katona"),
    GameRecord("b", "0-1", "52jVwlOp", "Adasko65"),
    GameRecord("w", "1-0", "IgYr6c86", "ubdip"),
    GameRecord("w", "1-0", "7OuDyu9R", "borjigin"),
    GameRecord("w", "1-0", "3d0cPRew", "Fairy-Stockfish"),
    GameRecord("b", "1-0", "Y3Yz48me", "Totonno_o_coreano"),
    GameRecord("w", "0-1", "sMi9CW0B", "Totonno_o_coreano"),  # tie break game
)

pairings["Totonno_o_coreano"] = (
    GameRecord("w", "1-0", "E7zjVFBZ", "timea_katona"),
    GameRecord("w", "1-0", "3tfpWyNs", "Adasko65"),
    GameRecord("b", "1-0", "LErk3AUQ", "ubdip"),
    GameRecord("b", "0-1", "C9ohE51U", "Fairy-Stockfish"),
    GameRecord("b", "0-1", "9VGRiIAl", "Jean-Guy"),
    GameRecord("b", "0-1", "mJYcBeod", "borjigin"),
    GameRecord("w", "1-0", "Y3Yz48me", "Dimarr"),
    GameRecord("b", "0-1", "sMi9CW0B", "Dimarr"),  # tie break game
)

pairings["Adasko65"] = (
    GameRecord("w", "0-1", "tt2ZVMFD", "ubdip"),  # VARIANTEND bikjang, point counting
    GameRecord("b", "1-0", "3tfpWyNs", "Totonno_o_coreano"),
    GameRecord("w", "0-1", "52jVwlOp", "Dimarr"),
    GameRecord("w", "0-1", "yp4NVTm9", "borjigin"),
    GameRecord("w", "0-1", "2bfoJ9KM", "Fairy-Stockfish"),
    GameRecord("b", "0-1", "9TkUC0ZX", "timea_katona"),
    GameRecord("w", "0-1", "Dq0kfwRb", "Jean-Guy"),
)

pairings["timea_katona"] = (
    GameRecord("b", "1-0", "E7zjVFBZ", "Totonno_o_coreano"),
    GameRecord("w", "0-1", "zWpPPLm6", "Dimarr"),
    GameRecord("w", "0-1", "Z1R3ONzo", "borjigin"),
    GameRecord("b", "1-0", "ZyMouxHU", "Jean-Guy"),
    GameRecord("b", "1-0", "8y5C66w9", "ubdip"),
    GameRecord("w", "0-1", "Ed9ZSGX7", "Fairy-Stockfish"),
    GameRecord("w", "0-1", "9TkUC0ZX", "Adasko65"),
)

pairings["Jean-Guy"] = (
    GameRecord("w", "0-1", "mi44nIL5", "Dimarr"),
    GameRecord("b", "1-0", "FUQUvfyq", "borjigin"),
    GameRecord("w", "1-0", "E08hJmB4", "Fairy-Stockfish"),
    GameRecord("w", "1-0", "ZyMouxHU", "timea_katona"),
    GameRecord("w", "0-1", "9VGRiIAl", "Totonno_o_coreano"),
    GameRecord("b", "1-0", "oYnoocKB", "ubdip"),
    GameRecord("b", "0-1", "Dq0kfwRb", "Adasko65"),
)

pairings["Fairy-Stockfish"] = (
    GameRecord("b", "1-0", "wkqJzfGX", "borjigin"),
    GameRecord("w", "0-1", "hB935gjd", "ubdip"),
    GameRecord("b", "1-0", "E08hJmB4", "Jean-Guy"),
    GameRecord("w", "0-1", "C9ohE51U", "Totonno_o_coreano"),
    GameRecord("b", "0-1", "2bfoJ9KM", "Adasko65"),
    GameRecord("b", "1-0", "3d0cPRew", "Dimarr"),
    GameRecord("b", "0-1", "Ed9ZSGX7", "timea_katona"),
)


async def add_games(app):
    tid = "00000001"

    await app["db"].tournament.delete_one({"_id": tid})
    await app["db"].tournament_player.delete_many({"tid": tid})
    await app["db"].tournament_pairing.delete_many({"tid": tid})

    data = {
        "tid": tid,
        "name": "First EJF Anniversary E-Tourn@ment",
        "createdBy": "Janggi-France",
        "createdAt": datetime(2019, 5, 2, tzinfo=timezone.utc),
        "variant": "janggi",
        "chess960": False,
        "base": 15,
        "inc": 30,
        "bp": 3,
        "fen": "",
        "system": RR,
        "rounds": 7,
        "rated": True,
        "beforeStart": 0,
        "minutes": 0,
        "status": T_ARCHIVED,
    }

    response = await new_tournament(app, data)

    t = app["tournaments"][response["tournamentId"]]

    t.clock_task.cancel()
    try:
        await t.clock_task
    except asyncio.CancelledError:
        pass

    users = app["users"]

    for player in pairings:
        t.join(users[player])

    # Check our data consistency
    for player in pairings:
        print("--- Checking %s games ---" % player)
        for record in pairings[player]:
            game = await load_game(app, record.id)
            if game is None:
                print("!!! Game id issue %s" % record.id)

            if game.result != record.result:
                print("!!! Result issue! %s" % record.id)

            if record.color == "w":
                if game.wplayer.username != player or game.bplayer.username != record.oppname:
                    print("!!! Player name issue! %s" % record.id)
            else:
                if game.bplayer.username != player or game.wplayer.username != record.oppname:
                    print("!!! Player name issue! %s" % record.id)

    print("======= Loading games ======")
    updated_games = set()

    for current_round in range(8):
        for player in pairings:
            if len(pairings[player]) <= current_round:
                t.players[users[player]].points.append("-")
                continue

            game_id = pairings[player][current_round].id

            if game_id not in updated_games:
                game = await load_game(app, game_id)
                print("--- %s - %s ---" % (game.wplayer.username, game.bplayer.username))
                wp = game.wplayer
                bp = game.bplayer

                if current_round == 0:
                    t.players[wp].rating = int(game.wrating.rstrip("?"))
                    t.players[bp].rating = int(game.brating.rstrip("?"))

                t.players[wp].games.append(game)
                t.players[bp].games.append(game)

                t.players[wp].points.append("*")
                t.players[bp].points.append("*")

                t.players[wp].nb_games += 1
                t.players[bp].nb_games += 1

                await t.game_update(game)
                updated_games.add(game_id)

    await t.save()
