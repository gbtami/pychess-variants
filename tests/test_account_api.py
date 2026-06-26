import json
import time
import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from bot_accounts import BOT_TOKEN_SCOPE, create_bot_token
from forum.constants import ERASED_POST_TEXT, ERASED_POST_USER
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

    async def test_bot_account_page_requires_login(self):
        response = await self.client.get("/account/bot", allow_redirects=False)
        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/login")

    async def test_create_and_revoke_bot_token(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "count": {"game": 0, "win": 0, "loss": 0, "draw": 0, "rated": 0},
            }
        )

        self.set_session_user("alice")
        response = await self.client.post(
            "/account/bot/token/create",
            data={"description": "primary bot"},
            allow_redirects=False,
        )
        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/account/bot")

        token_doc = await app_state.db.bot_token.find_one({"user": "alice"})
        self.assertIsNotNone(token_doc)
        self.assertEqual("primary bot", token_doc.get("description"))

        page = await self.client.get("/account/bot")
        self.assertEqual(page.status, 200)
        body = await page.text()
        self.assertIn("Created a new BOT API token", body)
        self.assertIn("This token is shown only once.", body)
        self.assertIn("primary bot", body)

        revoke = await self.client.post(
            f"/account/bot/token/{token_doc['_id']}/revoke",
            allow_redirects=False,
        )
        self.assertEqual(revoke.status, 302)

        revoked_doc = await app_state.db.bot_token.find_one({"_id": token_doc["_id"]})
        self.assertIn("revokedAt", revoked_doc)

    async def test_api_bot_account_upgrade_promotes_zero_game_account(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "count": {"game": 0, "win": 0, "loss": 0, "draw": 0, "rated": 0},
            }
        )
        _, raw_token = await create_bot_token(app_state, "alice", "upgrade token")
        headers = {"Authorization": f"Bearer {raw_token}"}

        response = await self.client.post("/api/bot/account/upgrade", headers=headers)
        self.assertEqual(response.status, 200)
        self.assertEqual({"ok": True}, await response.json())

        user_doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertEqual("BOT", user_doc.get("title"))
        self.assertTrue(user.bot)
        self.assertEqual("BOT", user.title)

        account_response = await self.client.get("/api/account", headers=headers)
        self.assertEqual(account_response.status, 200)
        self.assertEqual("BOT", (await account_response.json())["title"])

        token_test = await self.client.post("/api/token/test", data=raw_token)
        token_payload = await token_test.json()
        self.assertEqual(BOT_TOKEN_SCOPE, token_payload[raw_token]["scopes"])
        self.assertEqual("alice", token_payload[raw_token]["userId"])

    async def test_api_bot_account_upgrade_rejects_played_account(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="alice")
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": "alice",
                "username_lower": "alice",
                "enabled": True,
                "count": {"game": 1, "win": 1, "loss": 0, "draw": 0, "rated": 0},
            }
        )
        _, raw_token = await create_bot_token(app_state, "alice", "upgrade token")

        response = await self.client.post(
            "/api/bot/account/upgrade",
            headers={"Authorization": f"Bearer {raw_token}"},
        )
        self.assertEqual(response.status, 400)
        self.assertIn("never played a single game", await response.text())

        user_doc = await app_state.db.user.find_one({"_id": "alice"})
        self.assertNotEqual("BOT", user_doc.get("title"))

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
        await app_state.db.forum_post.insert_one(
            {
                "_id": "post1",
                "topicId": "topic1",
                "categId": "general",
                "user": "alice",
                "text": "alice forum post",
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": None,
                "editCount": 0,
            }
        )
        await app_state.db.ublog_post.insert_one(
            {
                "_id": "blog1",
                "author": "alice",
                "title": "Alice draft",
                "intro": "intro",
                "markdown": "blog body",
                "topics": ["updates"],
                "language": "en",
                "image": "",
                "imageAlt": "",
                "imageCredit": "",
                "live": False,
                "discuss": False,
                "sticky": False,
                "views": 0,
                "likes": [],
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
                "publishedAt": None,
            }
        )
        await app_state.db.push_subscription.insert_one(
            {
                "_id": "push1",
                "user": "alice",
                "endpoint": "https://push.example.test/sub",
                "auth": "auth-token",
                "p256dh": "p256dh-token",
                "createdAt": datetime.now(timezone.utc),
                "seenAt": datetime.now(timezone.utc),
            }
        )
        await app_state.db.user_report.insert_one(
            {
                "_id": "report1",
                "reporter": "alice",
                "suspect": "bob",
                "reason": "abuse",
                "text": "alice report text",
                "createdAt": datetime.now(timezone.utc),
                "status": "open",
            }
        )
        await app_state.db.user_report.insert_one(
            {
                "_id": "report2",
                "reporter": "carol",
                "suspect": "alice",
                "reason": "spam",
                "text": "report about alice",
                "createdAt": datetime.now(timezone.utc),
                "status": "open",
            }
        )

        self.set_session_user("alice")
        response = await self.client.get("/account/personal-data/export")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.content_type, "text/plain")
        body = await response.text()
        self.assertIn("Personal data export for", body)
        self.assertIn('"oauth_id": "alice-oauth"', body)
        self.assertIn("Direct messages sent by this account", body)
        self.assertIn("hello", body)
        self.assertNotIn("secret from carol", body)
        self.assertIn("Forum posts by this account", body)
        self.assertIn("alice forum post", body)
        self.assertIn("Blog posts by this account", body)
        self.assertIn("Alice draft", body)
        self.assertIn("blog body", body)
        self.assertIn("Push subscriptions", body)
        self.assertIn("https://push.example.test/sub", body)
        self.assertIn("Reports created by this account", body)
        self.assertIn("alice report text", body)
        self.assertNotIn("report about alice", body)
        self.assertNotIn("Inbox threads", body)
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
        user.notifications = [{"_id": "cached-notify"}]
        app_state.lobby.lobby_broadcast_seeks = AsyncMock()
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
        await app_state.db.forum_topic.insert_many(
            [
                {
                    "_id": "topic1",
                    "categId": "general-chess-discussion",
                    "slug": "alice-topic",
                    "name": "Alice topic",
                    "user": "alice",
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "nbPosts": 1,
                    "lastPostId": "post1",
                    "lastPostAt": datetime.now(timezone.utc),
                    "lastPostUser": "alice",
                    "closed": False,
                    "sticky": False,
                },
                {
                    "_id": "topic2",
                    "categId": "general-chess-discussion",
                    "slug": "bob-topic",
                    "name": "Bob topic",
                    "user": "bob",
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "nbPosts": 1,
                    "lastPostId": "post2",
                    "lastPostAt": datetime.now(timezone.utc),
                    "lastPostUser": "bob",
                    "closed": False,
                    "sticky": False,
                },
            ]
        )
        await app_state.db.forum_post.insert_many(
            [
                {
                    "_id": "post1",
                    "topicId": "topic1",
                    "categId": "general-chess-discussion",
                    "user": "alice",
                    "text": "Alice forum text",
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "editCount": 1,
                },
                {
                    "_id": "post2",
                    "topicId": "topic2",
                    "categId": "general-chess-discussion",
                    "user": "bob",
                    "text": "Bob forum text",
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": None,
                    "editCount": 0,
                    "reactions": {"plusOne": ["alice", "carol"]},
                },
            ]
        )
        await app_state.db.ublog_post.insert_many(
            [
                {
                    "_id": "blog1",
                    "author": "alice",
                    "title": "Alice blog",
                    "intro": "intro",
                    "markdown": "body",
                    "topics": ["updates"],
                    "language": "en",
                    "image": "",
                    "imageAlt": "",
                    "imageCredit": "",
                    "live": True,
                    "discuss": True,
                    "sticky": False,
                    "views": 0,
                    "likes": ["bob"],
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "publishedAt": datetime.now(timezone.utc),
                },
                {
                    "_id": "blog2",
                    "author": "bob",
                    "title": "Bob blog",
                    "intro": "intro",
                    "markdown": "body",
                    "topics": ["updates"],
                    "language": "en",
                    "image": "",
                    "imageAlt": "",
                    "imageCredit": "",
                    "live": True,
                    "discuss": False,
                    "sticky": False,
                    "views": 0,
                    "likes": ["alice", "carol"],
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "publishedAt": datetime.now(timezone.utc),
                },
            ]
        )
        await app_state.db.push_subscription.insert_one(
            {
                "_id": "push1",
                "user": "alice",
                "endpoint": "https://push.example.test/sub",
                "auth": "auth-token",
                "p256dh": "p256dh-token",
                "createdAt": datetime.now(timezone.utc),
                "seenAt": datetime.now(timezone.utc),
            }
        )
        await app_state.db.account_reopen_token.insert_one(
            {
                "_id": "reopen1",
                "username": "alice",
                "tokenHash": self.reopen_token_hash("delete-token"),
                "createdAt": datetime.now(timezone.utc),
                "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=20),
            }
        )
        await app_state.db.notify.insert_one(
            {
                "_id": "notify1",
                "notifies": "alice",
                "type": "forumMention",
                "read": False,
                "createdAt": datetime.now(timezone.utc),
                "expireAt": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "content": {"id": "post2", "opp": "bob"},
            }
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
        await app_state.db.seek.insert_one(
            {
                "_id": "seek1",
                "seekID": "seek1",
                "user": "alice",
                "variant": "chess",
                "target": "",
                "player1": "alice",
                "player2": "",
                "bugPlayer1": "",
                "bugPlayer2": "",
                "fen": "",
                "color": "r",
                "rated": False,
                "rrmin": 0,
                "rrmax": 3000,
                "rating": 1500,
                "base": 5,
                "inc": 0,
                "byoyomi": 0,
                "day": 0,
                "gameId": "invite1",
            }
        )
        seek = SimpleNamespace(id="seek1", creator=user, game_id="invite1")
        app_state.seeks[seek.id] = seek
        app_state.invites["invite1"] = seek
        user.seeks[seek.id] = seek
        await app_state.db.lobbychat.insert_many(
            [
                {"type": "lobbychat", "user": "alice", "message": "alice lobby message"},
                {"type": "lobbychat", "user": "bob", "message": "bob lobby message"},
            ]
        )
        await app_state.db.tournament_chat.insert_many(
            [
                {
                    "tid": "tour1",
                    "type": "lobbychat",
                    "user": "alice",
                    "message": "alice tournament message",
                },
                {
                    "tid": "tour1",
                    "type": "lobbychat",
                    "user": "bob",
                    "message": "bob tournament message",
                },
            ]
        )
        await app_state.db.simul_chat.insert_many(
            [
                {
                    "sid": "simul1",
                    "type": "lobbychat",
                    "user": "alice",
                    "message": "alice simul message",
                },
                {
                    "sid": "simul1",
                    "type": "lobbychat",
                    "user": "bob",
                    "message": "bob simul message",
                },
            ]
        )
        await app_state.db.game.insert_one(
            {
                "_id": "bug1",
                "c": [
                    {"u": "alice", "m": "alice bug chat", "t": 1},
                    {"u": "bob", "m": "bob bug chat", "t": 2},
                ],
            }
        )
        await app_state.db.tournament.insert_one(
            {"_id": "tour-hist", "createdBy": "alice", "status": 0}
        )
        await app_state.db.simul.insert_one({"_id": "sim-hist", "createdBy": "alice", "status": 0})
        app_state.lobby.lobbychat = [
            {"type": "lobbychat", "user": "alice", "message": "cached alice lobby"},
            {"type": "lobbychat", "user": "bob", "message": "cached bob lobby"},
        ]
        app_state.tournaments["tour1"] = SimpleNamespace(
            tourneychat=[
                {"type": "lobbychat", "user": "alice", "message": "cached alice tournament"},
                {"type": "lobbychat", "user": "bob", "message": "cached bob tournament"},
            ]
        )
        app_state.simuls["simul1"] = SimpleNamespace(
            tourneychat=[
                {"type": "lobbychat", "user": "alice", "message": "cached alice simul"},
                {"type": "lobbychat", "user": "bob", "message": "cached bob simul"},
            ]
        )
        app_state.games["g1"] = SimpleNamespace(
            corr=True,
            messages=[
                {"type": "roundchat", "user": "alice", "message": "cached alice game"},
                {"type": "roundchat", "user": "bob", "message": "cached bob game"},
            ],
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
        self.assertEqual([], user.notifications)

        relation_doc = await app_state.db.relation.find_one({"_id": "alice/bob"})
        self.assertIsNone(relation_doc)

        msg_doc = await app_state.db.inbox_msg.find_one({"_id": "msg1"})
        self.assertIsNotNone(msg_doc)
        self.assertEqual("[deleted by account deletion request]", msg_doc.get("text"))

        forum_post = await app_state.db.forum_post.find_one({"_id": "post1"})
        self.assertIsNotNone(forum_post)
        self.assertEqual(ERASED_POST_USER, forum_post.get("user"))
        self.assertEqual(ERASED_POST_TEXT, forum_post.get("text"))
        self.assertIn("erasedAt", forum_post)
        self.assertNotIn("updatedAt", forum_post)

        forum_topic = await app_state.db.forum_topic.find_one({"_id": "topic1"})
        self.assertIsNotNone(forum_topic)
        self.assertEqual(ERASED_POST_USER, forum_topic.get("user"))
        self.assertEqual(ERASED_POST_USER, forum_topic.get("lastPostUser"))

        other_forum_post = await app_state.db.forum_post.find_one({"_id": "post2"})
        self.assertEqual(["carol"], other_forum_post.get("reactions", {}).get("plusOne"))

        self.assertIsNone(await app_state.db.ublog_post.find_one({"_id": "blog1"}))
        other_blog = await app_state.db.ublog_post.find_one({"_id": "blog2"})
        self.assertEqual(["carol"], other_blog.get("likes"))

        self.assertEqual(0, await app_state.db.push_subscription.count_documents({"user": "alice"}))
        self.assertEqual(
            0, await app_state.db.account_reopen_token.count_documents({"username": "alice"})
        )
        self.assertEqual(0, await app_state.db.notify.count_documents({"notifies": "alice"}))
        self.assertEqual(0, await app_state.db.seek.count_documents({"user": "alice"}))
        self.assertNotIn("seek1", app_state.seeks)
        self.assertNotIn("invite1", app_state.invites)
        self.assertEqual({}, user.seeks)
        app_state.lobby.lobby_broadcast_seeks.assert_awaited_once()

        lobby_rows = await app_state.db.lobbychat.find().sort("user", 1).to_list(10)
        self.assertEqual(ERASED_POST_USER, lobby_rows[0]["user"])
        self.assertEqual("[deleted by account deletion request]", lobby_rows[0]["message"])
        self.assertEqual("bob", lobby_rows[1]["user"])
        self.assertEqual("bob lobby message", lobby_rows[1]["message"])

        tournament_rows = await app_state.db.tournament_chat.find().sort("user", 1).to_list(10)
        self.assertEqual(ERASED_POST_USER, tournament_rows[0]["user"])
        self.assertEqual("[deleted by account deletion request]", tournament_rows[0]["message"])
        self.assertEqual("bob", tournament_rows[1]["user"])
        self.assertEqual("bob tournament message", tournament_rows[1]["message"])

        simul_rows = await app_state.db.simul_chat.find().sort("user", 1).to_list(10)
        self.assertEqual(ERASED_POST_USER, simul_rows[0]["user"])
        self.assertEqual("[deleted by account deletion request]", simul_rows[0]["message"])
        self.assertEqual("bob", simul_rows[1]["user"])
        self.assertEqual("bob simul message", simul_rows[1]["message"])

        bug_game = await app_state.db.game.find_one({"_id": "bug1"})
        self.assertEqual(ERASED_POST_USER, bug_game["c"][0]["u"])
        self.assertEqual("[deleted by account deletion request]", bug_game["c"][0]["m"])
        self.assertEqual("bob", bug_game["c"][1]["u"])
        self.assertEqual("bob bug chat", bug_game["c"][1]["m"])
        self.assertEqual(1, await app_state.db.game.count_documents({"_id": "bug1"}))
        self.assertEqual(1, await app_state.db.tournament.count_documents({"_id": "tour-hist"}))
        self.assertEqual(1, await app_state.db.simul.count_documents({"_id": "sim-hist"}))

        self.assertEqual(ERASED_POST_USER, app_state.lobby.lobbychat[0]["user"])
        self.assertEqual("cached bob lobby", app_state.lobby.lobbychat[1]["message"])
        self.assertEqual(ERASED_POST_USER, app_state.tournaments["tour1"].tourneychat[0]["user"])
        self.assertEqual(
            "cached bob tournament", app_state.tournaments["tour1"].tourneychat[1]["message"]
        )
        self.assertEqual(ERASED_POST_USER, app_state.simuls["simul1"].tourneychat[0]["user"])
        self.assertEqual("cached bob simul", app_state.simuls["simul1"].tourneychat[1]["message"])
        self.assertEqual(ERASED_POST_USER, app_state.games["g1"].messages[0]["user"])
        self.assertEqual("cached bob game", app_state.games["g1"].messages[1]["message"])

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
