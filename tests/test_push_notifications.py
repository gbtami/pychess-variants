import json
import time
import unittest

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


test_logger.init_test_logger()


class PushSubscribeTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_push_subscribe_stores_subscription(self):
        app_state = get_app_state(self.app)
        app_state.push_notifier.enabled = True

        user = User(app_state, username="push_user")
        app_state.users[user.username] = user
        self.set_session_user(user.username)

        payload = {
            "endpoint": "https://example.com/sub/1",
            "keys": {
                "auth": "auth-key",
                "p256dh": "p256dh-key",
            },
        }

        response = await self.client.post("/push/subscribe", json=payload)
        self.assertEqual(response.status, 200)

        stored = await app_state.db.push_subscription.find_one({"user": user.username})
        self.assertIsNotNone(stored)
        self.assertEqual(stored["endpoint"], payload["endpoint"])
        self.assertEqual(stored["auth"], payload["keys"]["auth"])
        self.assertEqual(stored["p256dh"], payload["keys"]["p256dh"])

    async def test_push_subscribe_rejects_anon_user(self):
        app_state = get_app_state(self.app)
        app_state.push_notifier.enabled = True

        anon_user = User(app_state, username="Anon-push", anon=True)
        app_state.users[anon_user.username] = anon_user
        self.set_session_user(anon_user.username)

        payload = {
            "endpoint": "https://example.com/sub/2",
            "keys": {
                "auth": "auth-key",
                "p256dh": "p256dh-key",
            },
        }

        response = await self.client.post("/push/subscribe", json=payload)
        self.assertEqual(response.status, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
