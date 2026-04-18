# -*- coding: utf-8 -*-

from datetime import datetime, timedelta, timezone

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User

test_logger.init_test_logger()


class ServerMetricsDiagnosticsTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_metrics_anon_summary_has_bucket_and_detached_diagnostics(self):
        app_state = get_app_state(self.app)

        anon_recent = User(app_state, anon=True)
        anon_recent.last_seen = datetime.now(timezone.utc) - timedelta(minutes=5)
        app_state.users[anon_recent.username] = anon_recent

        anon_mid = User(app_state, anon=True)
        anon_mid.last_seen = datetime.now(timezone.utc) - timedelta(minutes=30)
        app_state.users[anon_mid.username] = anon_mid

        anon_default = User(app_state, anon=True)
        app_state.users[anon_default.username] = anon_default

        response = await self.client.get(
            "/metrics?inspect=True",
            headers={"Authorization": "Bearer test"},
        )
        self.assertEqual(response.status, 200)
        payload = await response.json()

        anon_summary_rows = payload["object_details"]["anon_summary"]
        self.assertEqual(len(anon_summary_rows), 1)
        summary = anon_summary_rows[0]

        required_keys = (
            "anon_total",
            "anon_with_default_last_seen",
            "anon_idle_lt_10m",
            "anon_idle_10m_to_60m",
            "anon_idle_over_60m",
            "anon_with_pending_remove_task",
            "anon_pending_remove_idle_default",
            "anon_pending_remove_idle_lt_10m",
            "anon_pending_remove_idle_10m_to_60m",
            "anon_pending_remove_idle_over_60m",
            "anon_removable_now",
            "anon_removable_idle_default",
            "anon_removable_idle_lt_10m",
            "anon_removable_idle_10m_to_60m",
            "anon_removable_idle_over_60m",
            "cached_users",
            "user_objects_total",
            "detached_user_objects",
        )
        for key in required_keys:
            self.assertIn(key, summary)

        idle_bucket_total = (
            summary["anon_with_default_last_seen"]
            + summary["anon_idle_lt_10m"]
            + summary["anon_idle_10m_to_60m"]
            + summary["anon_idle_over_60m"]
        )
        self.assertEqual(idle_bucket_total, summary["anon_total"])

        pending_bucket_total = (
            summary["anon_pending_remove_idle_default"]
            + summary["anon_pending_remove_idle_lt_10m"]
            + summary["anon_pending_remove_idle_10m_to_60m"]
            + summary["anon_pending_remove_idle_over_60m"]
        )
        self.assertEqual(pending_bucket_total, summary["anon_with_pending_remove_task"])

        removable_bucket_total = (
            summary["anon_removable_idle_default"]
            + summary["anon_removable_idle_lt_10m"]
            + summary["anon_removable_idle_10m_to_60m"]
            + summary["anon_removable_idle_over_60m"]
        )
        self.assertEqual(removable_bucket_total, summary["anon_removable_now"])

        expected_detached = max(0, summary["user_objects_total"] - summary["cached_users"])
        self.assertEqual(summary["detached_user_objects"], expected_detached)
