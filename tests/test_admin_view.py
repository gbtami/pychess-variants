import json
import time
from datetime import UTC, datetime
from unittest.mock import patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User

from server import make_app


class AdminViewTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_admin_pages_reject_non_admin(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")
        self.set_session_user("alice")

        with patch("views.admin.ADMINS", ["mod"]):
            overview = await self.client.get("/admin")
            users = await self.client.get("/admin/users")

        self.assertEqual(overview.status, 403)
        self.assertEqual(users.status, 403)

    async def test_admin_overview_renders_shared_navigation(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        self.set_session_user("mod")

        with patch("views.admin.ADMINS", ["mod"]):
            response = await self.client.get("/admin")

        self.assertEqual(response.status, 200)
        body = await response.text()
        self.assertIn("Administration", body)
        self.assertIn('href="/reports?status=open"', body)
        self.assertIn('href="/mod/public-chat"', body)
        self.assertIn('href="/admin/users"', body)
        self.assertIn("admin.css", body)

    async def test_user_search_is_case_insensitive_and_renders_status(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        self.set_session_user("mod")

        created_at = datetime(2025, 2, 3, tzinfo=UTC)
        await app_state.db.user.insert_one(
            {
                "_id": "MixedCase",
                "username_lower": "mixedcase",
                "title": "FM",
                "enabled": False,
                "shadowban": True,
                "createdAt": created_at,
                "count": {"game": 12, "win": 7, "loss": 3, "draw": 2, "rated": 10},
                "security": {
                    "ipHashes": ["ip-one"],
                    "fpHashes": ["fp-one", "fp-two"],
                    "ipfpHashes": [],
                    "lastAutoCloseReason": "ban evasion",
                    "lastAutoCloseAt": created_at,
                },
            }
        )
        await app_state.db.mod_log.insert_one(
            {
                "_id": "log-one",
                "mod": "mod",
                "user": "MixedCase",
                "action": "chat_timeout",
                "details": "spamming the chat",
                "createdAt": created_at,
            }
        )

        with patch("views.admin.ADMINS", ["mod"]):
            response = await self.client.get(
                "/admin/users?username=%40mixedcase&done=reopen_account"
            )

        self.assertEqual(response.status, 200)
        body = await response.text()
        self.assertIn('href="/@/MixedCase"', body)
        self.assertIn("Closed", body)
        self.assertIn("Shadowbanned", body)
        self.assertIn("12 total · 7 wins · 3 losses · 2 draws", body)
        self.assertIn("IP 1 · fingerprint 2 · combined 0", body)
        self.assertIn("ban evasion", body)
        self.assertIn("Reopen account completed.", body)
        self.assertIn("Chat timeout", body)
        self.assertIn("spamming the chat", body)
        self.assertIn("/api/admin/users/MixedCase/unshadowban", body)
        self.assertIn("/api/admin/users/MixedCase/reopen", body)
        self.assertIn("admin-action-dialog", body)

    async def test_protected_user_page_hides_action_buttons(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        await app_state.db.user.insert_one({"_id": "mod", "username_lower": "mod", "enabled": True})
        self.set_session_user("mod")

        with patch("views.admin.ADMINS", ["mod"]), patch("admin.ADMINS", ["mod"]):
            response = await self.client.get("/admin/users?username=mod")

        self.assertEqual(response.status, 200)
        body = await response.text()
        self.assertIn("This is a protected account", body)
        self.assertNotIn("data-admin-action=", body)

    async def test_user_search_reports_invalid_and_missing_user(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        self.set_session_user("mod")

        with patch("views.admin.ADMINS", ["mod"]):
            invalid = await self.client.get("/admin/users?username=not%20valid")
            missing = await self.client.get("/admin/users?username=missing")

        self.assertEqual(invalid.status, 200)
        self.assertIn("Enter a valid username.", await invalid.text())
        self.assertEqual(missing.status, 200)
        self.assertIn("User not found.", await missing.text())


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)
