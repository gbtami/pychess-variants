# -*- coding: utf-8 -*-

import logging
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import VARIANTS, STARTED
from glicko2.glicko2 import DEFAULT_PERF
from seek import Seek
from server import make_app
from user import User
from users import Users
from utils import join_seek, load_game
from pychess_global_app_state_utils import get_app_state

logging.basicConfig()
logging.getLogger().setLevel(level=logging.ERROR)

PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}
JANGGI_START_FEN = "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1"
RED_SETUP_FEN = "rbna1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1"
BLUE_SETUP_FEN = "rbna1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RBNA1ANBR w - - 0 1"
C1D3_FEN = "rbna1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C1N3C1/4K4/RB1A1ANBR b - - 1 1"
C10D8_FEN = "rb1a1abnr/4k4/1c1n3c1/p1p1p1p1p/9/9/P1P1P1P1P/1C1N3C1/4K4/RB1A1ANBR w - - 2 2"

CLOCKS = [0, 0]


async def simulate_setup(game, color, fen):
    game.board.initial_fen = fen
    game.initial_fen = game.board.initial_fen
    game.board.fen = game.board.initial_fen
    game.steps[0]["fen"] = fen

    if color == "black":
        game.bsetup = False
    else:
        game.wsetup = False
        game.status = STARTED

    await game.save_setup()


class CorrJanggiGameTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def create_users(self):
        app_state = get_app_state(self.app)

        blue_player = User(app_state, username="blue", perfs=PERFS)
        red_player = User(app_state, username="red", perfs=PERFS)

        app_state.users["blue"] = blue_player
        app_state.users["red"] = red_player

        await app_state.db.user.delete_many({})
        await app_state.db.user.insert_one({"_id": "blue"})
        await app_state.db.user.insert_one({"_id": "red"})

    async def server_restart(self):
        app_state = get_app_state(self.app)

        app_state.games = {}
        app_state.users = Users(app_state)

        games = app_state.db.game
        doc = await games.find_one({"us": ["blue", "red"]})

        game = await load_game(app_state, doc["_id"])
        if game is not None:
            app_state.games[doc["_id"]] = game
            game.wplayer.correspondence_games.append(game)
            game.bplayer.correspondence_games.append(game)

        return game

    async def new_game(self):
        app_state = get_app_state(self.app)

        blue_player = app_state.users["blue"]
        red_player = app_state.users["red"]

        seek = Seek(
            blue_player,
            "janggi",
            color="w",
            day=1,
            player1=blue_player,
        )
        app_state.seeks[seek.id] = seek
        response = await join_seek(app_state, red_player, seek.id)
        gameId = response["gameId"]

        game = app_state.games[gameId]
        return game

    async def test_without_server_restart(self):
        app_state = get_app_state(self.app)

        await self.create_users()
        game = await self.new_game()

        # THE NEW GAME
        games = app_state.db.game
        doc = await games.find_one({"_id": game.id})

        self.assertEqual(doc["_id"], game.id)
        self.assertTrue(doc["c"])  # corr game
        self.assertTrue(doc["bs"])  # needs red setup
        self.assertTrue(doc["ws"])  # needs blue setup
        self.assertEqual(doc["if"], JANGGI_START_FEN)  # initial FEN

        # RED SETUP
        await simulate_setup(game, "black", RED_SETUP_FEN)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertTrue(doc["ws"])
        self.assertEqual(doc["if"], RED_SETUP_FEN)

        # BLUE SETUP
        await simulate_setup(game, "white", BLUE_SETUP_FEN)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)

        # BLUE MOVE
        await game.play_move("c1d3", clocks=CLOCKS)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)
        self.assertEqual(doc["f"], C1D3_FEN)  # current FEN

        # RED MOVE
        await game.play_move("c10d8", clocks=CLOCKS)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)
        self.assertEqual(doc["f"], C10D8_FEN)  # current FEN

    async def test_with_server_restart(self):
        app_state = get_app_state(self.app)

        await self.create_users()
        game = await self.new_game()

        # SERVER RESTART !
        game = await self.server_restart()

        # NEW GAME
        games = app_state.db.game
        doc = await games.find_one({"_id": game.id})

        self.assertEqual(doc["_id"], game.id)
        self.assertTrue(doc["c"])  # corr game
        self.assertTrue(doc["bs"])  # needs red setup
        self.assertTrue(doc["ws"])  # needs blue setup
        self.assertEqual(doc["if"], JANGGI_START_FEN)  # initial FEN

        # SERVER RESTART !
        game = await self.server_restart()

        # RED SETUP
        await simulate_setup(game, "black", RED_SETUP_FEN)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertTrue(doc["ws"])
        self.assertEqual(doc["if"], RED_SETUP_FEN)

        # SERVER RESTART !
        game = await self.server_restart()

        # BLUE SETUP
        await simulate_setup(game, "white", BLUE_SETUP_FEN)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)

        # SERVER RESTART !
        game = await self.server_restart()

        # BLUE MOVE
        await game.play_move("c1d3", clocks=CLOCKS)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)
        self.assertEqual(doc["f"], C1D3_FEN)  # current FEN

        # SERVER RESTART !
        game = await self.server_restart()

        # RED MOVE
        await game.play_move("c10d8", clocks=CLOCKS)
        doc = await games.find_one({"_id": game.id})

        self.assertFalse(doc["bs"])
        self.assertFalse(doc["ws"])
        self.assertEqual(doc["if"], BLUE_SETUP_FEN)
        self.assertEqual(doc["f"], C10D8_FEN)  # current FEN


if __name__ == "__main__":
    unittest.main(verbosity=2)
