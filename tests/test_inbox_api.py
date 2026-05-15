import json
import time
from datetime import datetime, timezone

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class InboxApiTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_send_and_read_inbox_message_flow(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        resp = await self.client.post("/api/inbox/thread/bob", data={"text": "hello bob"})
        self.assertEqual(resp.status, 200)
        payload = await resp.json()
        self.assertTrue(payload.get("ok"))

        threads_resp = await self.client.get("/api/inbox/threads")
        self.assertEqual(threads_resp.status, 200)
        threads_payload = await threads_resp.json()
        self.assertEqual(1, len(threads_payload["threads"]))
        self.assertEqual("bob", threads_payload["threads"][0]["user"])
        self.assertFalse(threads_payload["threads"][0]["unread"])

        self.set_session_user("bob")
        unread_before = await (await self.client.get("/api/inbox/unread")).json()
        self.assertEqual(1, unread_before["unread"])

        thread_resp = await self.client.get("/api/inbox/thread/alice")
        self.assertEqual(thread_resp.status, 200)
        thread_payload = await thread_resp.json()
        self.assertEqual("alice", thread_payload["contact"]["name"])
        self.assertEqual(1, len(thread_payload["messages"]))
        self.assertEqual("hello bob", thread_payload["messages"][0]["text"])
        self.assertEqual("alice", thread_payload["messages"][0]["from"])

        unread_after = await (await self.client.get("/api/inbox/unread")).json()
        self.assertEqual(0, unread_after["unread"])

    async def test_cannot_send_message_to_blocked_user(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        alice.blocked.add("bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        resp = await self.client.post("/api/inbox/thread/bob", data={"text": "blocked"})
        self.assertEqual(resp.status, 403)
        payload = await resp.json()
        self.assertEqual("error", payload.get("type"))

    async def test_delete_conversation_hides_only_for_deleting_user(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        resp = await self.client.post("/api/inbox/thread/bob", data={"text": "hello bob"})
        self.assertEqual(resp.status, 200)

        delete_resp = await self.client.post("/api/inbox/thread/bob/delete")
        self.assertEqual(delete_resp.status, 200)
        delete_payload = await delete_resp.json()
        self.assertTrue(delete_payload.get("ok"))

        alice_threads = await (await self.client.get("/api/inbox/threads")).json()
        self.assertEqual([], alice_threads["threads"])

        alice_convo = await (await self.client.get("/api/inbox/thread/bob")).json()
        self.assertEqual([], alice_convo["messages"])

        self.set_session_user("bob")
        bob_threads = await (await self.client.get("/api/inbox/threads")).json()
        self.assertEqual(1, len(bob_threads["threads"]))
        self.assertEqual("alice", bob_threads["threads"][0]["user"])

        bob_convo = await (await self.client.get("/api/inbox/thread/alice")).json()
        self.assertEqual(1, len(bob_convo["messages"]))
        self.assertEqual("hello bob", bob_convo["messages"][0]["text"])

    async def test_thread_pagination_returns_latest_tail_and_loads_older_with_before(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        app_state.chat_flood.allow_message = lambda source, text: True

        self.set_session_user("alice")
        for idx in range(105):
            resp = await self.client.post("/api/inbox/thread/bob", data={"text": f"m{idx}"})
            self.assertEqual(resp.status, 200)

        self.set_session_user("bob")
        page1_resp = await self.client.get("/api/inbox/thread/alice")
        self.assertEqual(page1_resp.status, 200)
        page1 = await page1_resp.json()
        self.assertEqual(100, len(page1["messages"]))
        self.assertTrue(page1["hasMore"])

        oldest_page1 = page1["messages"][0]["createdAt"]
        oldest_dt = datetime.fromisoformat(oldest_page1)
        if oldest_dt.tzinfo is None:
            oldest_dt = oldest_dt.replace(tzinfo=timezone.utc)
        before_ms = int(oldest_dt.timestamp() * 1000)

        page2_resp = await self.client.get(f"/api/inbox/thread/alice?before={before_ms}")
        self.assertEqual(page2_resp.status, 200)
        page2 = await page2_resp.json()
        self.assertEqual(5, len(page2["messages"]))
        self.assertFalse(page2["hasMore"])

    async def test_inbox_post_sanitizes_blacklisted_links(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        resp = await self.client.post(
            "/api/inbox/thread/bob", data={"text": "visit https://tinyurl.com/abc"}
        )
        self.assertEqual(resp.status, 200)

        self.set_session_user("bob")
        thread_resp = await self.client.get("/api/inbox/thread/alice")
        self.assertEqual(thread_resp.status, 200)
        thread_payload = await thread_resp.json()
        self.assertEqual("visit [redacted]", thread_payload["messages"][0]["text"])

    async def test_inbox_post_rejects_repeated_similar_messages(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        self.set_session_user("alice")
        first = await self.client.post("/api/inbox/thread/bob", data={"text": "hello bob"})
        self.assertEqual(first.status, 200)

        repeated = await self.client.post("/api/inbox/thread/bob", data={"text": "  Hello   bob  "})
        self.assertEqual(repeated.status, 429)
        repeated_payload = await repeated.json()
        self.assertEqual("error", repeated_payload.get("type"))


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)
