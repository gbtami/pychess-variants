# -*- coding: utf-8 -*-

import asyncio
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import T_CREATED, T_STARTED, T_FINISHED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from simul.simul import Simul
from user import User

class SimulTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def test_simul_creation_and_pairing(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5
        host_username = "TestUser_1"
        sid = id8()

        simul = Simul(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        host = User(app_state, username=host_username)
        simul.join(host)

        for i in range(2, NB_PLAYERS + 1):
            player = User(app_state, username=f"TestUser_{i}")
            simul.join(player)

        self.assertEqual(len(simul.players), NB_PLAYERS)

        await simul.start()

        self.assertEqual(simul.status, T_STARTED)
        self.assertEqual(len(simul.ongoing_games), NB_PLAYERS - 1)

        for game in simul.ongoing_games:
            self.assertTrue(game.wplayer.username == host_username or game.bplayer.username == host_username)

if __name__ == "__main__":
    unittest.main(verbosity=2)
