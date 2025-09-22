# -*- coding: utf-8 -*-

import asyncio
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import T_CREATED, T_STARTED, T_FINISHED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from tournament.auto_play_arena import SimulTestTournament

import logging

log = logging.getLogger(__name__)

class SimulTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def test_simul_creation_and_pairing(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5
        host_username = "TestUser_1"
        sid = id8()

        self.simul = SimulTestTournament(app_state, sid, before_start=0, minutes=0, created_by=host_username)
        app_state.simuls[sid] = self.simul

        await self.simul.join_players(NB_PLAYERS)

        self.assertEqual(len(self.simul.players), NB_PLAYERS)

        # Manually start the simul
        await self.simul.start_simul()

        # Let the clock run to create pairings
        await asyncio.sleep(0.1)

        self.assertEqual(len(self.simul.ongoing_games), NB_PLAYERS - 1)

        for game in self.simul.ongoing_games:
            self.assertTrue(game.wplayer.username == host_username or game.bplayer.username == host_username)

        # Let the games finish
        await asyncio.gather(*self.simul.game_tasks)

        # Let the clock run to finish the simul
        await asyncio.sleep(0.1)

        self.assertEqual(self.simul.status, T_FINISHED)
        await self.simul.clock_task

if __name__ == "__main__":
    unittest.main(verbosity=2)
