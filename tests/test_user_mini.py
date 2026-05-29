from datetime import datetime, timezone
import json
import time
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class UserMiniJoinedAtTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def startup(self, app):
        app_state = get_app_state(app)
        await app_state.db.user.insert_many(
            [
                # Missing createdAt uses the internal MINYEAR sentinel path.
                {"_id": "legacy-user"},
                {"_id": "recent-user", "createdAt": datetime(2024, 4, 20, tzinfo=timezone.utc)},
            ]
        )

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_user_mini_omits_unknown_joined_at(self):
        response = await self.client.get("/@/legacy-user/mini")
        self.assertEqual(response.status, 200)
        payload = await response.json()

        self.assertIn("joinedAt", payload)
        self.assertIsNone(payload["joinedAt"])

    async def test_user_mini_keeps_real_joined_at(self):
        response = await self.client.get("/@/recent-user/mini")
        self.assertEqual(response.status, 200)
        payload = await response.json()

        self.assertEqual(payload["joinedAt"], "2024-04-20T00:00:00Z")

    async def test_user_mini_reflects_follow_and_friends_only_message_state(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob", pm_friends_only=True)
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        response = await self.client.get("/@/bob/mini")
        self.assertEqual(response.status, 200)
        payload = await response.json()
        self.assertFalse(payload.get("canMessage"))
        self.assertTrue(payload.get("canFollow"))
        self.assertFalse(payload.get("following"))

        follow_resp = await self.client.post("/api/bob/follow", data={"follow": "true"})
        self.assertEqual(follow_resp.status, 200)

        response = await self.client.get("/@/bob/mini")
        self.assertEqual(response.status, 200)
        payload = await response.json()
        self.assertTrue(payload.get("canMessage"))
        self.assertTrue(payload.get("following"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
