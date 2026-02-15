# -*- coding: utf-8 -*-

import json
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import test_logger
from aiohttp.test_utils import AioHTTPTestCase, make_mocked_request
from mongomock_motor import AsyncMongoMockClient

from admin import ban, baninfo, unban
from pychess_global_app_state_utils import get_app_state
from security_evasion import collect_client_signals
from server import make_app
from user import User
from wsl import handle_lobbychat

test_logger.init_test_logger()


class SignupSecurityEvasionTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def _set_session(self, payload: dict[str, str]) -> None:
        session_data = {"session": payload, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_confirm_username_auto_closes_on_ipfp_ban_signal(self):
        app_state = get_app_state(self.app)
        headers = {
            "X-Forwarded-For": "198.51.100.44",
            "User-Agent": "SecurityTestUA/1.0",
            "Accept-Language": "en-US,en;q=0.8",
            "Cookie": "pcfp=fp-test",
        }
        mock_req = make_mocked_request("POST", "/api/confirm-username", headers=headers)
        signals = collect_client_signals(mock_req)
        self.assertIsNotNone(signals.ipfp_hash)
        await app_state.db.security_ban_signal.insert_one(
            {"_id": f"ipfp:{signals.ipfp_hash}", "kind": "ipfp"}
        )

        self._set_session(
            {
                "oauth_id": "oauth-evil",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "evil-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-test"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "blocked_signup"},
            headers={
                "X-Forwarded-For": "198.51.100.44",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 403)

        created = await app_state.db.user.find_one({"_id": "blocked_signup"})
        self.assertIsNotNone(created)
        self.assertFalse(created.get("enabled", True))

    async def test_confirm_username_succeeds_without_ban_signals(self):
        app_state = get_app_state(self.app)
        self._set_session(
            {
                "oauth_id": "oauth-good",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "good-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-good"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "normal_signup"},
            headers={
                "X-Forwarded-For": "198.51.100.55",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertTrue(body.get("success"))

        created = await app_state.db.user.find_one({"_id": "normal_signup"})
        self.assertIsNotNone(created)
        self.assertTrue(created.get("enabled", False))


class AdminBanUnbanSignalsTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient())

    async def tearDownAsync(self):
        await self.client.close()

    async def test_ban_stores_signals_and_unban_reenables_user(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="cheater")
        app_state.users[user.username] = user

        await app_state.db.user.insert_one(
            {
                "_id": "cheater",
                "enabled": True,
                "security": {
                    "ipHashes": ["iph1"],
                    "fpHashes": ["fph1"],
                    "ipfpHashes": ["ipfph1"],
                },
            }
        )

        await ban(app_state, "/ban cheater")
        banned_doc = await app_state.db.user.find_one({"_id": "cheater"})
        self.assertFalse(banned_doc.get("enabled", True))
        self.assertFalse(user.enabled)

        signals = await app_state.db.security_ban_signal.find().to_list(length=10)
        kinds = {doc.get("kind") for doc in signals}
        self.assertIn("ip", kinds)
        self.assertIn("fp", kinds)
        self.assertIn("ipfp", kinds)

        await unban(app_state, "/unban cheater")
        unbanned_doc = await app_state.db.user.find_one({"_id": "cheater"})
        self.assertTrue(unbanned_doc.get("enabled", False))
        self.assertTrue(user.enabled)

    async def test_baninfo_reports_autoclose_reason_and_active_counts(self):
        app_state = get_app_state(self.app)
        auto_close_at = datetime.now(timezone.utc)
        await app_state.db.user.insert_one(
            {
                "_id": "closed_user",
                "enabled": False,
                "security": {
                    "ipHashes": ["iph1"],
                    "fpHashes": ["fph1"],
                    "ipfpHashes": ["ipfph1"],
                    "lastAutoCloseReason": "ipfp",
                    "lastAutoCloseAt": auto_close_at,
                },
            }
        )
        await app_state.db.security_ban_signal.insert_many(
            [
                {"_id": "ip:iph1", "kind": "ip"},
                {"_id": "fp:fph1", "kind": "fp"},
                {"_id": "ipfp:ipfph1", "kind": "ipfp"},
            ]
        )

        response = await baninfo(app_state, "/baninfo closed_user")
        self.assertEqual(response["type"], "lobbychat")
        message = response["message"]
        self.assertIn("enabled=False", message)
        self.assertIn("autoClose=ipfp", message)
        self.assertIn("stored(ip=1,fp=1,ipfp=1)", message)
        self.assertIn("active(ip=1,fp=1,ipfp=1)", message)

    async def test_baninfo_command_does_not_ban_user(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one({"_id": "target_user", "enabled": True, "security": {}})

        admin_user = User(app_state, username="test_admin")
        ws = object()
        payload = {"type": "lobbychat", "message": "/baninfo target_user"}

        with (
            patch("wsl.ADMINS", ["test_admin"]),
            patch("wsl.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_lobbychat(app_state, ws, admin_user, payload)

        target_doc = await app_state.db.user.find_one({"_id": "target_user"})
        self.assertTrue(target_doc.get("enabled", False))
        send.assert_awaited_once()

    async def test_unban_removes_only_unbanned_user_signal_sources(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_many(
            [
                {
                    "_id": "cheater_a",
                    "enabled": True,
                    "security": {
                        "ipHashes": ["shared", "only_a"],
                        "fpHashes": [],
                        "ipfpHashes": [],
                    },
                },
                {
                    "_id": "cheater_b",
                    "enabled": True,
                    "security": {"ipHashes": ["shared"], "fpHashes": [], "ipfpHashes": []},
                },
            ]
        )

        await ban(app_state, "/ban cheater_a")
        await ban(app_state, "/ban cheater_b")

        shared_before = await app_state.db.security_ban_signal.find_one({"_id": "ip:shared"})
        self.assertIsNotNone(shared_before)
        self.assertEqual(set(shared_before.get("sources", [])), {"cheater_a", "cheater_b"})

        await unban(app_state, "/unban cheater_a")

        only_a = await app_state.db.security_ban_signal.find_one({"_id": "ip:only_a"})
        self.assertIsNone(only_a)

        shared_after = await app_state.db.security_ban_signal.find_one({"_id": "ip:shared"})
        self.assertIsNotNone(shared_after)
        self.assertEqual(set(shared_after.get("sources", [])), {"cheater_b"})
