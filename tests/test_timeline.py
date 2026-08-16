import json
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from aiohttp.test_utils import AioHTTPTestCase
from const import BLOCK, FOLLOW
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User

from server import make_app


class TimelineTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_public_activity_is_fanned_out_to_followers_and_sent_live(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        await app_state.db.relation.insert_one(
            {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW}
        )

        sent = []
        socket = AsyncMock()
        app_state.lobby.lobbysockets["bob"] = {socket}

        async def capture(_sockets, message):
            sent.append(message)

        import timeline

        original_send = timeline.ws_send_json_many
        timeline.ws_send_json_many = capture
        try:
            await app_state.timeline.publish(
                "forum-post",
                alice,
                {"categ": "general", "slug": "hello", "topic": "Hello", "postId": "post1234"},
            )
        finally:
            timeline.ws_send_json_many = original_send

        entries = await app_state.timeline.entries_for("bob")
        self.assertEqual(1, len(entries))
        self.assertEqual("forum-post", entries[0]["type"])
        self.assertEqual("alice", entries[0]["data"]["actor"])
        self.assertEqual([{"type": "reload_timeline"}], sent)

    async def test_shadowbanned_activity_and_blocked_recipients_are_excluded(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        carol = User(app_state, username="carol")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        app_state.users[carol.username] = carol
        await app_state.db.relation.insert_many(
            [
                {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW},
                {"_id": "carol/alice", "u1": "carol", "u2": "alice", "r": FOLLOW},
                {"_id": "alice/carol", "u1": "alice", "u2": "carol", "r": BLOCK},
            ]
        )

        await app_state.timeline.publish(
            "simul-create", alice, {"simulId": "12345678", "name": "Simul"}
        )
        self.assertEqual(1, len(await app_state.timeline.entries_for("bob")))
        self.assertEqual([], await app_state.timeline.entries_for("carol"))

        alice.shadowban = True
        await app_state.timeline.publish(
            "simul-create", alice, {"simulId": "87654321", "name": "Hidden"}
        )
        self.assertEqual(1, len(await app_state.timeline.entries_for("bob")))

    async def test_follow_activity_goes_only_to_mutual_friends_and_is_not_duplicated(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        carol = User(app_state, username="carol")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        app_state.users[carol.username] = carol
        await app_state.db.relation.insert_many(
            [
                {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW},
                {"_id": "carol/alice", "u1": "carol", "u2": "alice", "r": FOLLOW},
            ]
        )

        self.set_session_user("alice")
        response = await self.client.post("/api/bob/follow", data={"follow": "true"})
        self.assertEqual(200, response.status)
        self.assertEqual(1, len(await app_state.timeline.entries_for("bob")))
        self.assertEqual([], await app_state.timeline.entries_for("carol"))

        response = await self.client.post("/api/bob/follow", data={"follow": "true"})
        self.assertEqual(200, response.status)
        self.assertEqual(1, await app_state.db.timeline_entry.count_documents({}))

    async def test_api_hides_expired_entries_and_requires_login(self):
        app_state = get_app_state(self.app)
        now = datetime.now(UTC)
        await app_state.db.timeline_entry.insert_many(
            [
                {
                    "type": "ublog-post",
                    "data": {
                        "actor": "alice",
                        "postId": "recent",
                        "slug": "recent",
                        "title": "Recent",
                    },
                    "users": ["bob"],
                    "date": now,
                },
                {
                    "type": "ublog-post",
                    "data": {"actor": "alice", "postId": "old", "slug": "old", "title": "Old"},
                    "users": ["bob"],
                    "date": now - timedelta(days=15),
                },
            ]
        )

        response = await self.client.get("/api/timeline")
        self.assertEqual(403, response.status)

        bob = User(app_state, username="bob")
        app_state.users[bob.username] = bob
        self.set_session_user("bob")
        response = await self.client.get("/api/timeline?nb=50")
        self.assertEqual(200, response.status)
        payload = await response.json()
        self.assertEqual(["recent"], [entry["data"]["postId"] for entry in payload["entries"]])

    async def test_block_removes_already_delivered_entries(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        await app_state.db.relation.insert_one(
            {"_id": "alice/bob", "u1": "alice", "u2": "bob", "r": FOLLOW}
        )
        await app_state.db.timeline_entry.insert_one(
            {
                "type": "forum-post",
                "data": {"actor": "bob", "postId": "post1234"},
                "users": ["alice"],
                "date": datetime.now(UTC),
            }
        )

        self.set_session_user("alice")
        response = await self.client.post("/api/bob/block", data={"block": "true"})
        self.assertEqual(200, response.status)
        self.assertEqual([], await app_state.timeline.entries_for("alice"))

    async def test_forum_channel_can_be_unsubscribed_and_resubscribed(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        carol = User(app_state, username="carol")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        app_state.users[carol.username] = carol
        await app_state.db.relation.insert_many(
            [
                {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW},
                {"_id": "carol/alice", "u1": "carol", "u2": "alice", "r": FOLLOW},
            ]
        )
        channel = "forum:topic123"

        await app_state.timeline.publish(
            "forum-post",
            alice,
            {"topic": "Topic", "postId": "first"},
            channel=channel,
        )
        self.assertFalse(await app_state.timeline.channel_status("bob", channel))

        self.set_session_user("bob")
        unsubscribe = await self.client.post(
            "/api/timeline/unsubscribe",
            data={"channel": channel, "unsubscribed": "true"},
        )
        self.assertEqual(200, unsubscribe.status)
        self.assertEqual(
            {"ok": True, "unsubscribed": True},
            await unsubscribe.json(),
        )
        self.assertTrue(await app_state.timeline.channel_status("bob", channel))

        await app_state.timeline.publish(
            "forum-post",
            alice,
            {"topic": "Topic", "postId": "second"},
            channel=channel,
        )
        self.assertEqual(
            ["first"],
            [entry["data"]["postId"] for entry in await app_state.timeline.entries_for("bob")],
        )
        self.assertEqual(
            ["second", "first"],
            [entry["data"]["postId"] for entry in await app_state.timeline.entries_for("carol")],
        )

        subscribe = await self.client.post(
            "/api/timeline/unsubscribe",
            data={"channel": channel, "unsubscribed": "false"},
        )
        self.assertEqual(200, subscribe.status)
        self.assertFalse(await app_state.timeline.channel_status("bob", channel))

        await app_state.timeline.publish(
            "forum-post",
            alice,
            {"topic": "Topic", "postId": "third"},
            channel=channel,
        )
        self.assertEqual(
            ["third", "first"],
            [entry["data"]["postId"] for entry in await app_state.timeline.entries_for("bob")],
        )

    async def test_timeline_unsubscribe_requires_login_and_a_forum_channel(self):
        response = await self.client.post(
            "/api/timeline/unsubscribe",
            data={"channel": "forum:topic123", "unsubscribed": "true"},
        )
        self.assertEqual(403, response.status)

        app_state = get_app_state(self.app)
        bob = User(app_state, username="bob")
        app_state.users[bob.username] = bob
        self.set_session_user("bob")
        invalid = await self.client.post(
            "/api/timeline/unsubscribe",
            data={"channel": "ublog:post123", "unsubscribed": "true"},
        )
        self.assertEqual(400, invalid.status)


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)
