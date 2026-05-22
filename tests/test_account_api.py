import json
import time
import hashlib
from datetime import datetime, timedelta, timezone

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class AccountApiTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    @staticmethod
    def reopen_token_hash(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    async def test_account_pages_require_login(self):
        response = await self.client.get("/account/personal-data", allow_redirects=False)
        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/login")

    async def test_personal_data_export_returns_private_sections(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice", oauth_id="alice-oauth", oauth_provider="lichess")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "oauth_id": "alice-oauth",
                "oauth_provider": "lichess",
                "createdAt": datetime.now(timezone.utc),
                "perfs": {},
                "pperfs": {},
                "count": {"game": 0, "win": 0, "loss": 0, "draw": 0, "rated": 0},
            }
        )
        await app_state.db.inbox_msg.insert_one(
            {
                "_id": "msg1",
                "tid": "alice:bob",
                "from": "alice",
                "to": "bob",
                "text": "hello",
                "createdAt": datetime.now(timezone.utc),
            }
        )
        await app_state.db.inbox_msg.insert_one(
            {
                "_id": "msg2",
                "tid": "carol:alice",
                "from": "carol",
                "to": "alice",
                "text": "secret from carol",
                "createdAt": datetime.now(timezone.utc),
            }
        )

        self.set_session_user("alice")
        response = await self.client.get("/account/personal-data/export")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.content_type, "text/plain")
        body = await response.text()
        self.assertIn("Personal data export for", body)
        self.assertIn('"oauth_id": "alice-oauth"', body)
        self.assertIn("Inbox messages sent by this account", body)
        self.assertIn("hello", body)
        self.assertNotIn("secret from carol", body)
        self.assertIn("Public game archives are handled separately", body)

    async def test_close_account_disables_user(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {"_id": "alice", "username_lower": "alice", "enabled": True}
        )

        self.set_session_user("alice")
        response = await self.client.post(
            "/account/close",
            data={"confirm_username": "alice", "understand": "on"},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 302)

        doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertIsNotNone(doc)
        self.assertFalse(doc.get("enabled", True))
        self.assertEqual("self", doc.get("closeType"))

    async def test_close_account_after_reopen_becomes_final(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "reopenedAt": datetime.now(timezone.utc),
            }
        )

        self.set_session_user("alice")
        response = await self.client.post(
            "/account/close",
            data={"confirm_username": "alice", "understand": "on"},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 302)

        doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertIsNotNone(doc)
        self.assertFalse(doc.get("enabled", True))
        self.assertEqual("self_final", doc.get("closeType"))

    async def test_delete_account_scrubs_personal_fields(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice", oauth_id="oauth-123", oauth_provider="lichess")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "title": "GM",
                "oauth_id": "oauth-123",
                "oauth_provider": "lichess",
                "perfs": {
                    "chess": {
                        "gl": {"r": 1500, "d": 350, "v": 0.06},
                        "la": datetime.now(timezone.utc),
                        "nb": 1,
                    }
                },
                "pperfs": {},
                "count": {"game": 1, "win": 1, "loss": 0, "draw": 0, "rated": 1},
            }
        )
        await app_state.db.relation.insert_one(
            {"_id": "alice/bob", "u1": "alice", "u2": "bob", "r": 1}
        )
        await app_state.db.inbox_msg.insert_one(
            {
                "_id": "msg1",
                "tid": "alice:bob",
                "from": "alice",
                "to": "bob",
                "text": "private text",
                "createdAt": datetime.now(timezone.utc),
            }
        )

        self.set_session_user("alice")
        response = await self.client.post(
            "/account/delete",
            data={"confirm_username": "alice", "understand": "on"},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 302)

        doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertIsNotNone(doc)
        self.assertFalse(doc.get("enabled", True))
        self.assertEqual("", doc.get("title", ""))
        self.assertEqual("", doc.get("oauth_id", ""))
        self.assertEqual("", doc.get("oauth_provider", ""))
        self.assertEqual({}, doc.get("perfs", {}))
        self.assertIn("gdprErasedAt", doc)
        self.assertEqual("deleted", doc.get("closeType"))

        relation_doc = await app_state.db.relation.find_one({"_id": "alice/bob"})
        self.assertIsNone(relation_doc)

        msg_doc = await app_state.db.inbox_msg.find_one({"_id": "msg1"})
        self.assertIsNotNone(msg_doc)
        self.assertEqual("[deleted by account deletion request]", msg_doc.get("text"))

    async def test_reopen_self_closed_account(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": False,
                "closeType": "self",
                "oauth_id": "alice-oauth",
                "oauth_provider": "lichess",
            }
        )
        raw_token = "reopen-token-alice"
        await app_state.db.account_reopen_token.insert_one(
            {
                "_id": "tok1",
                "username": "alice",
                "tokenHash": self.reopen_token_hash(raw_token),
                "createdAt": datetime.now(timezone.utc),
                "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=20),
            }
        )

        page = await self.client.get(f"/account/reopen?token={raw_token}")
        self.assertEqual(page.status, 200)
        body = await page.text()
        self.assertIn("Reopen your account", body)

        response = await self.client.post(
            "/account/reopen",
            data={"confirm_username": "alice", "understand": "on", "token": raw_token},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/")

        doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertTrue(doc.get("enabled", False))
        self.assertNotIn("closeType", doc)

        token_doc = await app_state.db.account_reopen_token.find_one({"_id": "tok1"})
        self.assertIn("usedAt", token_doc)

    async def test_reopen_requires_token(self):
        response = await self.client.get("/account/reopen", allow_redirects=False)
        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/login")

    async def test_reopen_rejects_expired_token(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one(
            {"_id": "alice", "username_lower": "alice", "enabled": False, "closeType": "self"}
        )
        raw_token = "expired-reopen-token"
        await app_state.db.account_reopen_token.insert_one(
            {
                "_id": "tok-expired",
                "username": "alice",
                "tokenHash": self.reopen_token_hash(raw_token),
                "createdAt": datetime.now(timezone.utc) - timedelta(minutes=40),
                "expiresAt": datetime.now(timezone.utc) - timedelta(minutes=1),
            }
        )

        response = await self.client.post(
            "/account/reopen",
            data={"confirm_username": "alice", "understand": "on", "token": raw_token},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 403)

    async def test_reopen_wrong_username_does_not_consume_token(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one(
            {"_id": "alice", "username_lower": "alice", "enabled": False, "closeType": "self"}
        )
        raw_token = "valid-reopen-token"
        await app_state.db.account_reopen_token.insert_one(
            {
                "_id": "tok2",
                "username": "alice",
                "tokenHash": self.reopen_token_hash(raw_token),
                "createdAt": datetime.now(timezone.utc),
                "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=20),
            }
        )

        bad_response = await self.client.post(
            "/account/reopen",
            data={"confirm_username": "bob", "understand": "on", "token": raw_token},
            allow_redirects=False,
        )
        self.assertEqual(bad_response.status, 400)

        token_doc = await app_state.db.account_reopen_token.find_one({"_id": "tok2"})
        self.assertNotIn("usedAt", token_doc)
