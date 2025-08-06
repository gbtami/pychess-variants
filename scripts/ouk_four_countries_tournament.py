from __future__ import annotations
from collections import namedtuple
from datetime import datetime, timezone
from typing import Tuple

from const import RR, T_ARCHIVED
from tournament import ByeGame
from tournaments import new_tournament
from utils import load_game
from pychess_global_app_state_utils import get_app_state

GameRecord = namedtuple("GameRecord", "color, result, id, oppname")

Pairings = dict[str, Tuple[GameRecord, ...]]

pairings: Pairings = {}

pairings["THA_Worathep_Timsri"] = (
    GameRecord("w", "1/2-1/2", "3ZJ0xqU3", "THA_Warot_Kananub"),
    GameRecord("w", "1-0", "Y48IEaIU", "WynnZawHtun"),
    GameRecord("b", "1/2-1/2", "WOlVmdYP", "CAM_Bora_Chheav"),
    GameRecord("w", "1-0", "g3sA0ByY", "VIE_Phan_Trong_Binh"),
    GameRecord("b", "0-1", "vJXxX1OR", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("w", "1/2-1/2", "OSVTK5cy", "CAM_Sok_Limheng"),
    GameRecord(b"", "0-1", "2AD5XPXe", "NyeinChanMya"),
)

pairings["THA_Warot_Kananub"] = (
    GameRecord("b", "1/2-1/2", "3ZJ0xqU3", "THA_Worathep_Timsri"),
    GameRecord("w", "1-0", "Aa9CsTS3", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("b", "0-1", "8LuIscCA", "WynnZawHtun"),
    GameRecord("w", "1-0", "wwqVXgdC", "CAM_Sok_Limheng"),
    GameRecord("b", "1-0", "nhRHSW3C", "CAM_Bora_Chheav"),
    GameRecord("w", "0-1", "qRxE8qyF", "NyeinChanMya"),
    GameRecord("b", "0-1", "yqR0Og7I", "VIE_Phan_Trong_Binh"),
)

pairings["WynnZawHtun"] = (
    GameRecord("w", "0-1", "29RxtO36", "NyeinChanMya"),
    GameRecord("b", "1-0", "Y48IEaIU", "THA_Worathep_Timsri"),
    GameRecord("w", "0-1", "8LuIscCA", "THA_Warot_Kananub"),
    GameRecord("w", "0-1", "o5z9yoAH", "CAM_Bora_Chheav"),
    GameRecord("b", "0-1", "wljrcVah", "VIE_Phan_Trong_Binh"),
    GameRecord("w", "1-0", "FXGPfVpN", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("b", "1/2-1/2", "XJxcYaNF", "CAM_Sok_Limheng"),
)

pairings["NyeinChanMya"] = (
    GameRecord("b", "0-1", "29RxtO36", "WynnZawHtun"),
    GameRecord("w", "0-1", "zUMo42ou", "CAM_Bora_Chheav"),
    GameRecord("b", "0-1", "BnjDAOTw", "VIE_Phan_Trong_Binh"),
    GameRecord("w", "1-0", "m9j4YzfD", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("b", "1/2-1/2", "QlKGjTgF", "CAM_Sok_Limheng"),
    GameRecord("b", "0-1", "qRxE8qyF", "THA_Warot_Kananub"),
    GameRecord("w", "0-1", "2AD5XPXe", "THA_Worathep_Timsri"),
)

pairings["CAM_Bora_Chheav"] = (
    GameRecord("w", "1/2-1/2", "pSzuoJei", "CAM_Sok_Limheng"),
    GameRecord("b", "0-1", "zUMo42ou", "NyeinChanMya"),
    GameRecord("w", "1/2-1/2", "WOlVmdYP", "THA_Worathep_Timsri"),
    GameRecord("b", "0-1", "o5z9yoAH", "WynnZawHtun"),
    GameRecord("w", "1-0", "nhRHSW3C", "THA_Warot_Kananub"),
    GameRecord("w", "1-0", "tMVg19xa", "VIE_Phan_Trong_Binh"),
    GameRecord("b", "0-1", "TtCNkxpg", "VIE_Tran_Nguyen_Hoan"),
)

pairings["CAM_Sok_Limheng"] = (
    GameRecord("b", "1/2-1/2", "pSzuoJei", "CAM_Bora_Chheav"),
    GameRecord("w", "1-0", "gC2Bsr3P", "VIE_Phan_Trong_Binh"),
    GameRecord("b", "0-1", "LLw2IAPX", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("b", "1-0", "wwqVXgdC", "THA_Warot_Kananub"),
    GameRecord("w", "1/2-1/2", "QlKGjTgF", "NyeinChanMya"),
    GameRecord("b", "1/2-1/2", "OSVTK5cy", "THA_Worathep_Timsri"),
    GameRecord("w", "1/2-1/2", "XJxcYaNF", "WynnZawHtun"),
)

pairings["VIE_Phan_Trong_Binh"] = (
    GameRecord("w", "1/2-1/2", "vNSoK4sb", "VIE_Tran_Nguyen_Hoan"),
    GameRecord("b", "1-0", "gC2Bsr3P", "CAM_Sok_Limheng"),
    GameRecord("w", "0-1", "BnjDAOTw", "NyeinChanMya"),
    GameRecord("b", "1-0", "g3sA0ByY", "THA_Worathep_Timsri"),
    GameRecord("w", "0-1", "wljrcVah", "WynnZawHtun"),
    GameRecord("b", "1-0", "tMVg19xa", "CAM_Bora_Chheav"),
    GameRecord("w", "0-1", "yqR0Og7I", "THA_Warot_Kananub"),
)

pairings["VIE_Tran_Nguyen_Hoan"] = (
    GameRecord("b", "1/2-1/2", "vNSoK4sb", "VIE_Phan_Trong_Binh"),
    GameRecord("b", "1-0", "Aa9CsTS3", "THA_Warot_Kananub"),
    GameRecord("w", "0-1", "LLw2IAPX", "CAM_Sok_Limheng"),
    GameRecord("b", "1-0", "m9j4YzfD", "NyeinChanMya"),
    GameRecord("w", "0-1", "vJXxX1OR", "THA_Worathep_Timsri"),
    GameRecord("b", "1-0", "FXGPfVpN", "WynnZawHtun"),
    GameRecord("w", "0-1", "TtCNkxpg", "CAM_Bora_Chheav"),
)


async def add_games(app):
    app_state = get_app_state(app)
    tid = "00000002"

    await app_state.db.tournament.delete_one({"_id": tid})
    await app_state.db.tournament_player.delete_many({"tid": tid})
    await app_state.db.tournament_pairing.delete_many({"tid": tid})

    data = {
        "tid": tid,
        "name": "Ouk Chaktrang Friendship Between Four Countries Tournament",
        "createdBy": "PyChess",
        "createdAt": datetime(2022, 9, 17, tzinfo=timezone.utc),
        "variant": "cambodian",
        "chess960": False,
        "base": 60,
        "inc": 0,
        "fen": "",
        "system": RR,
        "rounds": 7,
        "rated": False,
        "beforeStart": 0,
        "minutes": 0,
        "status": T_ARCHIVED,
        "with_clock": False,
    }

    t = await new_tournament(app_state, data)

    users = app_state.users

    for player in pairings:
        await t.join(users[player])

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

    for current_round in range(7):
        for player in pairings:
            if len(pairings[player]) <= current_round:
                t.players[users[player]].games.append(ByeGame())
                t.players[users[player]].points.append("-")
                continue

            game_id = pairings[player][current_round].id

            if game_id not in updated_games:
                game = await load_game(app, game_id)
                print(
                    "--- %s - %s --- %s" % (game.wplayer.username, game.bplayer.username, game.date)
                )
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
