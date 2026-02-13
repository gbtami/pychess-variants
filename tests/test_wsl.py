# -*- coding: utf-8 -*-

import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from aiohttp.web_ws import WebSocketResponse
from mongomock_motor import AsyncMongoMockClient

from glicko2.glicko2 import DEFAULT_PERF
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsl import finally_logic

test_logger.init_test_logger()

PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


class LobbySocketCleanupTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.user = User(app_state, username="aplayer", perfs=PERFS)
        app_state.users[self.user.username] = self.user

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
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
