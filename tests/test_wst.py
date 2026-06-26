# -*- coding: utf-8 -*-

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from glicko2.glicko2 import new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from server import make_app
from tournament.wst import finally_logic, handle_join
from user import User
from variants import VARIANTS

test_logger.init_test_logger()

PERFS = new_default_perf_map(VARIANTS)


class TournamentSocketCleanupTestCase(AioHTTPTestCase):
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

    async def test_finally_logic_handles_missing_tournament(self):
        app_state = get_app_state(self.app)
        tournament_id = "missingTourney"
        ws = object()

        self.user.tournament_sockets[tournament_id] = {ws}
        app_state.tourneysockets[tournament_id] = {
            self.user.username: self.user.tournament_sockets[tournament_id]
        }

        # Simulate tournament already gone from cache/database.
        app_state.tournaments.pop(tournament_id, None)
        await app_state.db.tournament.delete_many({"_id": tournament_id})

        await finally_logic(app_state, ws, self.user)

        self.assertNotIn(tournament_id, self.user.tournament_sockets)
        self.assertNotIn(self.user.username, app_state.tourneysockets[tournament_id])

    async def test_bot_user_cannot_join_tournament(self):
        app_state = get_app_state(self.app)
        bot_user = User(app_state, bot=True, username="bot-tourney", perfs=PERFS)
        ws = SimpleNamespace(send_str=AsyncMock())
        tournament = SimpleNamespace(
            join=AsyncMock(return_value="BOT accounts cannot join tournaments.")
        )

        with patch("tournament.wst.load_tournament", new=AsyncMock(return_value=tournament)):
            await handle_join(app_state, ws, bot_user, {"type": "join", "tournamentId": "tid"})

        tournament.join.assert_awaited_once_with(bot_user, None)
        self.assertIn("BOT accounts cannot join tournaments", ws.send_str.call_args.args[0])
