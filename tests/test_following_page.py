import json
import time
from datetime import UTC, datetime

from aiohttp.test_utils import AioHTTPTestCase
from const import FOLLOW
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User

from server import make_app


class FollowingPageTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_lists_followed_users_with_pagination_and_profile_data(self):
        app_state = get_app_state(self.app)
        owner = User(app_state, username="owner")
        app_state.users[owner.username] = owner
        self.set_session_user(owner.username)

        relations = []
        users = []
        for index in range(31):
            username = f"friend{index:02d}"
            relations.append(
                {"_id": f"owner/{username}", "u1": "owner", "u2": username, "r": FOLLOW}
            )
            users.append(
                {
                    "_id": username,
                    "title": "FM" if index == 0 else "",
                    "enabled": True,
                    "count": {"game": index, "win": 0, "loss": 0, "draw": 0, "rated": 0},
                    "perfs": (
                        {
                            "chess": {
                                "gl": {"r": 1875.0, "d": 80.0, "v": 0.06},
                                "la": datetime.now(UTC),
                                "nb": 12,
                            }
                        }
                        if index == 0
                        else {}
                    ),
                }
            )
        await app_state.db.relation.insert_many(relations)
        await app_state.db.user.insert_many(users)

        response = await self.client.get("/@/owner/following")
        self.assertEqual(200, response.status)
        html = await response.text()
        self.assertEqual(30, html.count('class="user-link ulpt"'))
        self.assertIn("FM</player-title> friend00", html)
        self.assertIn("1875", html)
        self.assertIn("Chess", html)
        self.assertIn('<a class="nav-link" href="/@/owner/following">Friends</a>', html)
        self.assertIn('href="/@/owner/following?page=2"', html)
        self.assertNotIn("friend30</a>", html)

        response = await self.client.get("/@/owner/following?page=2")
        self.assertEqual(200, response.status)
        html = await response.text()
        self.assertEqual(1, html.count('class="user-link ulpt"'))
        self.assertIn("friend30</a>", html)
        self.assertIn('href="/@/owner/following"', html)

    async def test_other_users_following_page_redirects_to_own(self):
        app_state = get_app_state(self.app)
        owner = User(app_state, username="owner")
        app_state.users[owner.username] = owner
        self.set_session_user(owner.username)

        response = await self.client.get("/@/somebody/following", allow_redirects=False)
        self.assertEqual(302, response.status)
        self.assertEqual("/@/owner/following", response.headers["Location"])

    async def test_anonymous_visitors_cannot_view_following_lists(self):
        response = await self.client.get("/@/somebody/following")
        self.assertEqual(403, response.status)
