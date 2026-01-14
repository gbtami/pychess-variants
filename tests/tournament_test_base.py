# -*- coding: utf-8 -*-

import asyncio
import logging

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import BYEGAME, STARTED
from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from server import make_app
from typedefs import pychess_global_app_state_key

import test_logger

test_logger.init_test_logger()

log = logging.getLogger(__name__)

ONE_TEST_ONLY = False


class TournamentTestCase(AioHTTPTestCase):
    async def tearDownAsync(self):
        app_state = get_app_state(self.app)
        has_games = len(app_state.games) > 0

        for game in app_state.games.values():
            if game.status == BYEGAME:  # ByeGame
                continue
            if game.status <= STARTED:
                await game.abort_by_server()

        if has_games and hasattr(self, "tournament") and hasattr(self.tournament, "game_tasks"):
            for task in self.tournament.game_tasks:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        await self.client.close()

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def reload_tournament(self, db_client, tournament_id):
        from tournament.tournaments import load_tournament

        app = make_app(db_client=db_client)
        app[pychess_global_app_state_key] = PychessGlobalAppState(app)
        app_state = get_app_state(app)
        tournament = await load_tournament(app_state, tournament_id)
        return app_state, tournament
