# -*- coding: utf-8 -*-

import asyncio
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from server.const import T_CREATED, T_STARTED, T_FINISHED
from server.newid import id8
from server.pychess_global_app_state_utils import get_app_state
from server.server import make_app
from server.tournament.auto_play_arena import SimulTestTournament

import logging

log = logging.getLogger(__name__)

class SimulTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def test_simul_clock_is_running(self):
        app_state = get_app_state(self.app)
        sid = id8()
        self.simul = SimulTestTournament(app_state, sid)
        app_state.simuls[sid] = self.simul

        self.assertIsNotNone(self.simul.clock_task)
        self.assertFalse(self.simul.clock_task.done())
        self.simul.clock_task.cancel() # clean up the task

if __name__ == "__main__":
    unittest.main(verbosity=2)
