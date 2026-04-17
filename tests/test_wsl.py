# -*- coding: utf-8 -*-

import asyncio
import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from aiohttp.web_ws import WebSocketResponse
from mongomock_motor import AsyncMongoMockClient

from glicko2.glicko2 import new_default_perf_map
from game import Game
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsl import finally_logic

test_logger.init_test_logger()

PERFS = new_default_perf_map(VARIANTS)


class LobbySocketCleanupTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.user = User(app_state, username="aplayer", perfs=PERFS)
        app_state.users[self.user.username] = self.user

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True))
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_finally_logic_handles_missing_lobby_socket_key(self):
        app_state = get_app_state(self.app)
        ws = WebSocketResponse()
        self.user.lobby_sockets.add(ws)

        # Simulate out-of-sync cleanup where user socket exists but dict entry is gone.
        app_state.lobby.lobbysockets.pop(self.user.username, None)

        await finally_logic(app_state, ws, self.user)

        self.assertEqual(len(self.user.lobby_sockets), 0)
        self.assertNotIn(self.user.username, app_state.lobby.lobbysockets)

    async def test_finally_logic_schedules_abandon_when_round_socket_never_connects(self):
        app_state = get_app_state(self.app)
        opp = User(app_state, username="opponent", perfs=PERFS)
        app_state.users[opp.username] = opp

        game = Game(app_state, "abnd0001", "chess", "", self.user, opp, base=1, inc=0, rated=False)
        app_state.games[game.id] = game
        self.assertEqual(self.user.game_in_progress, game.id)

        ws = WebSocketResponse()
        self.user.lobby_sockets.add(ws)
        app_state.lobby.lobbysockets[self.user.username] = self.user.lobby_sockets

        await finally_logic(app_state, ws, self.user)

        self.assertIn(game.id, self.user.abandon_game_tasks)

        task = self.user.abandon_game_tasks[game.id]
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        self.assertNotIn(game.id, self.user.abandon_game_tasks)

    async def test_finally_logic_does_not_schedule_abandon_when_other_lobby_socket_remains(self):
        app_state = get_app_state(self.app)
        opp = User(app_state, username="opponent2", perfs=PERFS)
        app_state.users[opp.username] = opp

        game = Game(app_state, "abnd0002", "chess", "", self.user, opp, base=1, inc=0, rated=False)
        app_state.games[game.id] = game
        self.assertEqual(self.user.game_in_progress, game.id)

        ws1 = WebSocketResponse()
        ws2 = WebSocketResponse()
        self.user.lobby_sockets.add(ws1)
        self.user.lobby_sockets.add(ws2)
        app_state.lobby.lobbysockets[self.user.username] = self.user.lobby_sockets

        await finally_logic(app_state, ws1, self.user)

        self.assertNotIn(game.id, self.user.abandon_game_tasks)
        self.assertIn(ws2, self.user.lobby_sockets)

        # Avoid shutdown-time close() on an unprepared websocket test double.
        self.user.lobby_sockets.discard(ws2)
        app_state.lobby.lobbysockets.pop(self.user.username, None)
