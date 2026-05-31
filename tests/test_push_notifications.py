import asyncio
import json
import time
import unittest

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
import push_notifications
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

    async def test_corr_push_pref_updates_user_and_db(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="pref_user")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one({"_id": user.username})
        self.set_session_user(user.username)

        response = await self.client.post(
            "/pref/corr-push",
            data={"corr_push": "false"},
        )
        self.assertEqual(response.status, 204)
        self.assertFalse(user.corr_push_enabled)

        stored = await app_state.db.user.find_one({"_id": user.username})
        self.assertIsNotNone(stored)
        self.assertFalse(stored["cps"])

    async def test_corr_push_pref_rejects_anon_user(self):
        app_state = get_app_state(self.app)
        anon_user = User(app_state, username="Anon-pref", anon=True)
        app_state.users[anon_user.username] = anon_user
        self.set_session_user(anon_user.username)

        response = await self.client.post(
            "/pref/corr-push",
            data={"corr_push": "false"},
        )
        self.assertEqual(response.status, 403)

    async def test_enqueue_skips_when_corr_push_pref_is_disabled(self):
        app_state = get_app_state(self.app)
        app_state.push_notifier.enabled = True
        user = User(app_state, username="pref_disabled")
        user.corr_push_enabled = False

        app_state.push_notifier.enqueue_corr_move(
            user,
            game_id="abcd1234",
            opponent="opponent",
            san="e4",
        )
        self.assertEqual(app_state.push_notifier.queue.qsize(), 0)

    async def test_deliver_retries_on_transient_failures_when_nothing_was_sent(self):
        app_state = get_app_state(self.app)
        notifier = app_state.push_notifier
        notifier.enabled = True

        await app_state.db.push_subscription.insert_one(
            {
                "user": "retry_user",
                "endpoint": "https://example.com/sub/retry",
                "auth": "auth-key",
                "p256dh": "p256dh-key",
                "seenAt": 2,
            }
        )

        original_webpush = push_notifications.webpush
        try:

            def fail_webpush(*args, **kwargs):
                raise RuntimeError("temporary failure")

            push_notifications.webpush = fail_webpush
            should_retry = await notifier._deliver_corr_move(
                push_notifications.CorrMovePushJob(
                    username="retry_user",
                    game_id="abcd1234",
                    opponent="opp",
                    san="e4",
                )
            )
        finally:
            push_notifications.webpush = original_webpush

        self.assertTrue(should_retry)

    async def test_deliver_skips_retry_when_at_least_one_send_succeeds(self):
        app_state = get_app_state(self.app)
        notifier = app_state.push_notifier
        notifier.enabled = True

        await app_state.db.push_subscription.insert_many(
            [
                {
                    "user": "mixed_user",
                    "endpoint": "https://example.com/sub/success",
                    "auth": "auth-key-1",
                    "p256dh": "p256dh-key-1",
                    "seenAt": 3,
                },
                {
                    "user": "mixed_user",
                    "endpoint": "https://example.com/sub/fail",
                    "auth": "auth-key-2",
                    "p256dh": "p256dh-key-2",
                    "seenAt": 2,
                },
            ]
        )

        original_webpush = push_notifications.webpush
        calls = {"count": 0}
        try:

            def mixed_webpush(*args, **kwargs):
                calls["count"] += 1
                if calls["count"] == 2:
                    raise RuntimeError("temporary failure")

            push_notifications.webpush = mixed_webpush
            should_retry = await notifier._deliver_corr_move(
                push_notifications.CorrMovePushJob(
                    username="mixed_user",
                    game_id="abcd1234",
                    opponent="opp",
                    san="e4",
                )
            )
        finally:
            push_notifications.webpush = original_webpush

        self.assertEqual(calls["count"], 2)
        self.assertFalse(should_retry)

    async def test_schedule_retry_enqueues_incremented_attempt(self):
        app_state = get_app_state(self.app)
        notifier = app_state.push_notifier
        notifier.enabled = True

        original_base_delay = push_notifications.PUSH_RETRY_BASE_DELAY_SECONDS
        original_max_delay = push_notifications.PUSH_RETRY_MAX_DELAY_SECONDS
        try:
            push_notifications.PUSH_RETRY_BASE_DELAY_SECONDS = 0.0
            push_notifications.PUSH_RETRY_MAX_DELAY_SECONDS = 0.0
            notifier._schedule_retry(
                push_notifications.CorrMovePushJob(
                    username="retry_schedule",
                    game_id="abcd1234",
                    opponent="opp",
                    san="e4",
                    attempt=0,
                )
            )
            await asyncio.sleep(0)
            await asyncio.sleep(0)
        finally:
            push_notifications.PUSH_RETRY_BASE_DELAY_SECONDS = original_base_delay
            push_notifications.PUSH_RETRY_MAX_DELAY_SECONDS = original_max_delay

        job = notifier.queue.get_nowait()
        self.assertEqual(job.attempt, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
