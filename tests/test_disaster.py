# -*- coding: utf-8 -*-

import asyncio
import logging
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock

from aiohttp.test_utils import AioHTTPTestCase

from const import ARENA, T_FINISHED
from fairy import BLACK
from server import make_app
from utils import play_move
from tournament import Tournament
from tournaments import load_tournament

logging.basicConfig()
logging.getLogger().setLevel(level=logging.DEBUG)


class Dummy:
    pass


class MongoMock:
    def __init__(self):
        self.tournament = Dummy()
        self.tournament_player = Dummy()
        self.tournament_pairing = Dummy()
        self.game = Dummy()
        self.user = Dummy()


async def agen_pairings():
    if True:
        return
    else:
        yield


async def agen_players():
    yield {
        "_id": "wwwwwwww",
        "a": False,
        "b": 0,
        "e": 0,
        "f": False,
        "g": 0,
        "p": [],
        "pr": "?",
        "r": 1500,
        "s": 0,
        "tid": "12345678",
        "uid": "wplayer",
        "w": 0,
        "wd": False
    }

    yield {
        "_id": "bbbbbbbb",
        "a": False,
        "b": 0,
        "e": 0,
        "f": False,
        "g": 0,
        "p": [],
        "pr": "?",
        "r": 1500,
        "s": 0,
        "tid": "12345678",
        "uid": "bplayer",
        "w": 0,
        "wd": False
    }


class ArenaTestTournament(Tournament):
    system = ARENA

    def create_pairing(self, waiting_players):
        self.game_tasks = set()
        return ((waiting_players[0], waiting_players[1]),)

    async def create_new_pairings(self, waiting_players):
        if self.nb_games_finished > 0:
            return []
        self.print_leaderboard()
        pairing, games = await Tournament.create_new_pairings(self, waiting_players)

        for game in games:
            self.app["games"][game.id] = game
            self.game_tasks.add(asyncio.create_task(self.play_disaster_game(game)))

    async def play_disaster_game(self, game):
        clock = game.ply_clocks[0]["white"]
        clocks = {"white": clock, "black": clock}
        game.berserk("white")

        for move in ("g1f3", "g8f6", "f3g1", "f6g8") * 8:
            cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
            print("---", move)
            await play_move(self.app, cur_player, game, move, clocks=clocks)

        task1 = game.game_ended(game.bplayer, "flag")
        task2 = self.pause(game.bplayer)
        task3 = play_move(self.app, game.bplayer, game, "f6g8", clocks=clocks)

        await asyncio.gather(task1, task2, task3)


class GamePlayTestCase(AioHTTPTestCase):

    async def startup(self, app):
        self.tid = "12345678"
        now = datetime.now(timezone.utc)
        doc = {
            "_id": self.tid,
            "b": 1.0,
            "beforeStart": 0,
            "bp": 0,
            "createdAt": now,
            "createdBy": "gbtami",
            "d": "",
            "f": "",
            "fr": "",
            "i": 0,
            "minutes": 0.1,
            "name": "arena",
            "nbPlayers": 0,
            "rounds": 0,
            "startsAt": now,
            "status": 0,
            "system": 9,
            "v": "n",
            "y": 1,
            "z": 0
        }

        self.app["db"] = MongoMock()

        self.app["db"].tournament.find_one = AsyncMock(return_value=doc)
        self.app["db"].tournament.find_one_and_update = AsyncMock(return_value=doc)
        self.app["db"].tournament.delete_many = AsyncMock(return_value=None)

        self.app["db"].tournament_player.find = MagicMock(return_value=(i async for i in agen_players()))

        self.app["db"].tournament_pairing.find = MagicMock(return_value=(i async for i in agen_pairings()))
        self.app["db"].tournament_pairing.insert_many = AsyncMock(return_value=None)

        self.app["db"].game.find_one = AsyncMock(return_value=None)
        self.app["db"].game.find_one_and_update = AsyncMock(return_value=None)
        self.app["db"].game.insert_one = AsyncMock(return_value=None)

        self.app["db"].user.find_one_and_update = AsyncMock(return_value=None)

        # self.tournament = ArenaTestTournament(self.app, self.tid, before_start=0, minutes=0.1)
        self.tournament = await load_tournament(self.app, self.tid, tournament_klass=ArenaTestTournament)

        self.test_wplayer = self.app["users"]["wplayer"]
        self.test_bplayer = self.app["users"]["bplayer"]

        print("---", self.tournament)

        self.app["tournaments"][self.tid] = self.tournament

        self.test_wplayer.tournament_sockets[self.tid] = set((None,))
        await self.tournament.join(self.test_wplayer)

        self.test_bplayer.tournament_sockets[self.tid] = set((None,))
        await self.tournament.join(self.test_bplayer)

    async def get_application(self):
        app = make_app(with_db=False)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        for game in self.app["games"].values():
            if game.remove_task is not None:
                game.remove_task.cancel()
                try:
                    await game.remove_task
                except asyncio.CancelledError:
                    pass

    async def test_tournament_disaster(self):

        await self.tournament.clock_task

        self.assertEqual(self.tournament.players[self.test_wplayer].nb_berserk, 1)

        self.assertEqual(self.tournament.status, T_FINISHED)


if __name__ == '__main__':
    unittest.main(verbosity=2)
