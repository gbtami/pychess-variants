# -*- coding: utf-8 -*-

import json
import asyncio
import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from unittest.mock import AsyncMock

from const import RATED
from game import Game
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsr import handle_reject_takeback, handle_takeback

test_logger.init_test_logger()

TEST_PLAYER_PERFS = new_default_perf_map(VARIANTS)


class TakebackBroadcastTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_bot_takeback_broadcasts_to_all_player_sockets(self):
        app_state = get_app_state(self.app)
        player = User(app_state, username="takeback-user", perfs=TEST_PLAYER_PERFS)
        bot = app_state.users["Random-Mover"]
        game = Game(
            app_state,
            id8(),
            "cambodian",
            "",
            player,
            bot,
            rated=False,
            create=True,
        )

        await game.play_move("e3e4")
        await game.play_move("c8c7")
        await game.play_move("f3f4")
        await game.play_move("e8d7")

        ws1 = AsyncMock()
        ws2 = AsyncMock()
        player.add_ws_for_game(game.id, ws1)
        player.add_ws_for_game(game.id, ws2)

        await handle_takeback(ws1, player, game)

        ws1.send_str.assert_awaited()
        ws2.send_str.assert_awaited()

        payload1 = json.loads(ws1.send_str.await_args.args[0])
        payload2 = json.loads(ws2.send_str.await_args.args[0])

        self.assertTrue(payload1["takeback"])
        self.assertTrue(payload2["takeback"])
        self.assertEqual(payload1["ply"], 2)
        self.assertEqual(payload2["ply"], 2)

    async def test_takeback_waits_for_move_lock(self):
        app_state = get_app_state(self.app)
        player = User(app_state, username="takeback-lock-user", perfs=TEST_PLAYER_PERFS)
        bot = app_state.users["Random-Mover"]
        game = Game(
            app_state,
            id8(),
            "cambodian",
            "",
            player,
            bot,
            rated=False,
            create=True,
        )

        await game.play_move("e3e4")
        await game.play_move("c8c7")
        await game.play_move("f3f4")
        await game.play_move("e8d7")

        ws = AsyncMock()
        player.add_ws_for_game(game.id, ws)

        await game.move_lock.acquire()
        task = asyncio.create_task(handle_takeback(ws, player, game))
        try:
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            self.assertEqual(
                game.board.fen, "rn1m1snr/2sk4/pppppppp/8/4PP2/PPPP2PP/8/RNSKMSNR w DEd - 1 3"
            )
        finally:
            game.move_lock.release()

        await task
        payload = json.loads(ws.send_str.await_args.args[0])
        self.assertTrue(payload["takeback"])
        self.assertEqual(payload["ply"], 2)

    async def test_casual_human_takeback_requires_opponent_acceptance(self):
        app_state = get_app_state(self.app)
        white = User(app_state, username="takeback-white", perfs=TEST_PLAYER_PERFS)
        black = User(app_state, username="takeback-black", perfs=TEST_PLAYER_PERFS)
        game = Game(app_state, id8(), "cambodian", "", white, black, rated=False, create=True)

        await game.play_move("e3e4")
        await game.play_move("c8c7")
        await game.play_move("f3f4")
        await game.play_move("e8d7")

        white_ws = AsyncMock()
        black_ws = AsyncMock()
        white.add_ws_for_game(game.id, white_ws)
        black.add_ws_for_game(game.id, black_ws)

        await handle_takeback(white_ws, white, game)

        self.assertEqual(game.board.ply, 4)
        self.assertEqual(game.takeback_offer, (white.username, 4))
        offer = json.loads(black_ws.send_str.await_args.args[0])
        self.assertEqual(offer["type"], "takeback_offer")
        self.assertEqual(offer["username"], white.username)

        await handle_takeback(black_ws, black, game)

        self.assertIsNone(game.takeback_offer)
        self.assertEqual(game.board.ply, 2)
        board = json.loads(white_ws.send_str.await_args.args[0])
        self.assertTrue(board["takeback"])
        self.assertEqual(board["ply"], 2)

    async def test_casual_human_can_reject_takeback(self):
        app_state = get_app_state(self.app)
        white = User(app_state, username="reject-white", perfs=TEST_PLAYER_PERFS)
        black = User(app_state, username="reject-black", perfs=TEST_PLAYER_PERFS)
        game = Game(app_state, id8(), "cambodian", "", white, black, rated=False, create=True)
        await game.play_move("e3e4")
        await game.play_move("c8c7")

        black_ws = AsyncMock()
        black.add_ws_for_game(game.id, black_ws)
        await handle_takeback(AsyncMock(), white, game)
        await handle_reject_takeback(black, game)

        self.assertIsNone(game.takeback_offer)
        self.assertEqual(game.board.ply, 2)
        response = json.loads(black_ws.send_str.await_args.args[0])
        self.assertEqual(response["type"], "takeback_rejected")

    async def test_takeback_after_requesters_move_rewinds_one_ply(self):
        app_state = get_app_state(self.app)
        white = User(app_state, username="single-white", perfs=TEST_PLAYER_PERFS)
        black = User(app_state, username="single-black", perfs=TEST_PLAYER_PERFS)
        game = Game(app_state, id8(), "cambodian", "", white, black, rated=False, create=True)
        await game.play_move("e3e4")
        await game.play_move("c8c7")
        await game.play_move("f3f4")
        await game.play_move("e8d7")

        await handle_takeback(AsyncMock(), black, game)
        await handle_takeback(AsyncMock(), white, game)

        self.assertEqual(game.board.ply, 3)
        self.assertEqual(len(game.clocks_w), 3)
        self.assertEqual(len(game.clocks_b), 2)

    async def test_casual_duck_game_allows_takeback(self):
        app_state = get_app_state(self.app)
        white = User(app_state, username="duck-white", perfs=TEST_PLAYER_PERFS)
        black = User(app_state, username="duck-black", perfs=TEST_PLAYER_PERFS)
        game = Game(app_state, id8(), "duck", "", white, black, rated=False, create=True)
        await game.play_move(game.board.legal_moves()[0])
        await game.play_move(game.board.legal_moves()[0])

        await handle_takeback(AsyncMock(), black, game)
        await handle_takeback(AsyncMock(), white, game)

        self.assertEqual(game.board.ply, 1)

    async def test_rated_game_rejects_takeback_server_side(self):
        app_state = get_app_state(self.app)
        white = User(app_state, username="rated-white", perfs=TEST_PLAYER_PERFS)
        black = User(app_state, username="rated-black", perfs=TEST_PLAYER_PERFS)
        game = Game(app_state, id8(), "cambodian", "", white, black, rated=RATED, create=True)
        await game.play_move("e3e4")
        await game.play_move("c8c7")

        ws = AsyncMock()
        await handle_takeback(ws, white, game)

        self.assertEqual(game.board.ply, 2)
        self.assertIsNone(game.takeback_offer)
        response = json.loads(ws.send_str.await_args.args[0])
        self.assertEqual(response["type"], "error")
        self.assertIn("not allowed", response["message"])
