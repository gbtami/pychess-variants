# -*- coding: utf-8 -*-

import logging
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

import game
from game import Game
from wsr import handle_rematch
from bug.game_bug import GameBug
from bug.wsr_bug import handle_rematch_bughouse
from glicko2.glicko2 import DEFAULT_PERF
from server import make_app
from user import User
from pychess_global_app_state_utils import get_app_state
from variants import VARIANTS

game.KEEP_TIME = 0
game.MAX_PLY = 120

logging.basicConfig()
logging.getLogger().setLevel(level=logging.ERROR)

PERFS = {
    "newplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
}

ONE_TEST_ONLY = False


class FakeWs:
    async def send_json(self, msg):
        # print("FakeWs.send_json()", msg)
        pass


class RamatchChess960GameTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.fake_ws = FakeWs()

        self.Aplayer = User(get_app_state(self.app), username="Aplayer", perfs=PERFS["newplayer"])
        self.Bplayer = User(get_app_state(self.app), username="Bplayer", perfs=PERFS["newplayer"])
        self.Cplayer = User(get_app_state(self.app), username="Cplayer", perfs=PERFS["newplayer"])
        self.Dplayer = User(get_app_state(self.app), username="Dplayer", perfs=PERFS["newplayer"])

        app_state.users["Aplayer"] = self.Aplayer
        app_state.users["Bplayer"] = self.Bplayer
        app_state.users["Cplayer"] = self.Cplayer
        app_state.users["Dplayer"] = self.Dplayer

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def play_game_and_rematch_game(self, game):
        app_state = get_app_state(self.app)
        print(
            "GAME (%s) %s - %s %s"
            % (game.id, game.wplayer.username, game.bplayer.username, game.initial_fen)
        )
        await game.game_ended(game.wplayer, "flag")

        data = {"gameId": game.id, "handicap": False}

        for user in game.all_players:
            if game.variant == "bughouse":
                resp = await handle_rematch_bughouse(app_state, game, user)
            else:
                resp = await handle_rematch(app_state, self.fake_ws, user, data, game)

        return resp

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_ramatch_ataxx(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "12345678",
            "ataxx",
            "",
            self.Aplayer,
            self.Bplayer,
            chess960=False,
        )
        await self.play_the_match(game)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_ramatch_bug_2vs2(self):
        app_state = get_app_state(self.app)
        game = GameBug(
            app_state,
            "12345678",
            "bughouse",
            "",
            self.Aplayer,
            self.Bplayer,
            self.Cplayer,
            self.Dplayer,
            chess960=True,
        )
        await self.play_the_match(game)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_ramatch_bug_1vs2(self):
        app_state = get_app_state(self.app)
        game = GameBug(
            app_state,
            "12345678",
            "bughouse",
            "",
            self.Aplayer,
            self.Aplayer,
            self.Cplayer,
            self.Dplayer,
            chess960=True,
        )
        await self.play_the_match(game)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_ramatch_bug_1vs1(self):
        app_state = get_app_state(self.app)
        game = GameBug(
            app_state,
            "12345678",
            "bughouse",
            "",
            self.Aplayer,
            self.Aplayer,
            self.Bplayer,
            self.Bplayer,
            chess960=True,
        )
        await self.play_the_match(game)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_ramatch_chess(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "12345678",
            "chess",
            "",
            self.Aplayer,
            self.Bplayer,
            chess960=True,
        )
        await self.play_the_match(game)

    async def play_the_match(self, game):
        app_state = get_app_state(self.app)
        app_state.games[game.id] = game
        resp = {
            "gameId": game.id,
            "wplayer": "Aplayer",
            "bplayer": "Bplayer",
        }

        x_game_fen = game.initial_fen
        y_game_fen = game.initial_fen

        for i in range(30):
            print(i)
            game = app_state.games[resp["gameId"]]

            resp = await self.play_game_and_rematch_game(game)

            new_game_fen = app_state.games[resp["gameId"]].initial_fen
            if i % 2 == 0:
                x_game_fen = new_game_fen
                self.assertEqual(x_game_fen, y_game_fen)
            else:
                y_game_fen = new_game_fen
                self.assertNotEqual(x_game_fen, y_game_fen)


if __name__ == "__main__":
    unittest.main(verbosity=2)
