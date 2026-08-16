import json
import time
from unittest.mock import patch

from aiohttp.test_utils import AioHTTPTestCase
from const import T_ABORTED
from mongomock_motor import AsyncMongoMockClient
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_tournament import SwissTestTournament
from user import User

from server import make_app


class TournamentCancelRedirectTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_cancel_created_tournament_redirects_to_tournaments(self):
        app_state = get_app_state(self.app)
        director = User(app_state, username="td-user")
        app_state.users[director.username] = director
        self.set_session_user(director.username)

        tournament_id = id8()
        tournament = SwissTestTournament(app_state, tournament_id, created_by=director.username)
        app_state.tournaments[tournament_id] = tournament

        with patch("views.tournament.is_tournament_director", return_value=True):
            response = await self.client.get(
                f"/tournament/{tournament_id}/cancel",
                allow_redirects=False,
            )

        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers["Location"], "/tournaments")
        self.assertEqual(app_state.tournaments[tournament_id].status, T_ABORTED)

    async def test_tournament_page_exposes_director_permission_to_client(self):
        app_state = get_app_state(self.app)
        director = User(app_state, username="td-user")
        app_state.users[director.username] = director
        self.set_session_user(director.username)

        tournament_id = id8()
        tournament = SwissTestTournament(app_state, tournament_id, created_by="another-user")
        app_state.tournaments[tournament_id] = tournament

        with patch("views.tournament.is_tournament_director", return_value=True):
            response = await self.client.get(f"/tournament/{tournament_id}")

        self.assertEqual(response.status, 200)
        self.assertIn('data-tournamentdirector="True"', await response.text())
