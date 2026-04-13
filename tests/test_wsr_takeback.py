# -*- coding: utf-8 -*-

import json
import asyncio
import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from unittest.mock import AsyncMock

from game import Game
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsr import handle_takeback

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

        await handle_takeback(ws1, game)

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
        task = asyncio.create_task(handle_takeback(ws, game))
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
