import json
import time
from datetime import datetime, timezone
from unittest.mock import patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class ReportApiTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_create_game_report_validates_game_participant(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        carol = User(app_state, username="carol")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob
        app_state.users[carol.username] = carol

        await app_state.db.game.insert_one({"_id": "AbCd1234", "us": ["alice", "bob"]})

        self.set_session_user("alice")
        bad_resp = await self.client.post(
            "/api/report/create",
            data={
                "source": "game",
                "suspect": "carol",
                "reason": "cheating",
                "details": "Carried by another game",
                "gameId": "AbCd1234",
            },
        )
        self.assertEqual(bad_resp.status, 400)

        ok_resp = await self.client.post(
            "/api/report/create",
            data={
                "source": "game",
                "suspect": "bob",
                "reason": "cheating",
                "details": "Suspicious move timing and engine-like moves.",
                "gameId": "AbCd1234",
            },
        )
        self.assertEqual(ok_resp.status, 200)
        payload = await ok_resp.json()
        self.assertTrue(payload.get("ok"))

        created = await app_state.db.user_report.find_one({"_id": payload["reportId"]})
        self.assertIsNotNone(created)
        self.assertEqual("alice", created["reporter"])
        self.assertEqual("bob", created["suspect"])
        self.assertEqual("game", created["source"])
        self.assertEqual("open", created["status"])

    async def test_report_queue_requires_admin(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")

        self.set_session_user("alice")
        resp = await self.client.get("/api/reports/queue")
        self.assertEqual(resp.status, 403)

    async def test_report_form_renders_for_inbox_context(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")
        app_state.users["bob"] = User(app_state, username="bob")

        await app_state.db.inbox_msg.insert_one(
            {
                "_id": "msg1",
                "tid": "alice:bob",
                "from": "bob",
                "to": "alice",
                "text": "test message",
                "createdAt": datetime.now(timezone.utc),
            }
        )

        self.set_session_user("alice")
        resp = await self.client.get("/report?source=inbox&username=bob")
        self.assertEqual(resp.status, 200)
        body = await resp.text()
        self.assertIn("Messages to report", body)
        self.assertIn("test message", body)
        self.assertIn("Verbal abuse / Cursing / Trolling", body)
        self.assertNotIn(">Cheating<", body)
        self.assertIn('href="/report/faq"', body)

    async def test_report_faq_page_renders(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")

        self.set_session_user("alice")
        resp = await self.client.get("/report/faq")
        self.assertEqual(resp.status, 200)
        body = await resp.text()
        self.assertIn("Report FAQ", body)
        self.assertIn("When should I submit a report?", body)

    async def test_admin_can_process_and_reopen_report(self):
        app_state = get_app_state(self.app)
        moderator = User(app_state, username="mod")
        app_state.users[moderator.username] = moderator

        await app_state.db.user_report.insert_one(
            {
                "_id": "RePo1234",
                "status": "open",
                "source": "profile",
                "reason": "harassment",
                "details": "harassment details",
                "reporter": "alice",
                "suspect": "bob",
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
                "inquiryBy": "",
            }
        )

        self.set_session_user("mod")
        with patch("report_api.ADMINS", ["mod"]):
            queue_resp = await self.client.get("/api/reports/queue")
            self.assertEqual(queue_resp.status, 200)
            queue_payload = await queue_resp.json()
            self.assertEqual(1, len(queue_payload["reports"]))

            inquiry_resp = await self.client.post("/api/reports/RePo1234/inquiry")
            self.assertEqual(inquiry_resp.status, 200)

            process_resp = await self.client.post("/api/reports/RePo1234/process")
            self.assertEqual(process_resp.status, 200)
            processed = await app_state.db.user_report.find_one({"_id": "RePo1234"})
            self.assertEqual("processed", processed["status"])
            self.assertEqual("mod", processed["processedBy"])

            reopen_resp = await self.client.post("/api/reports/RePo1234/reopen")
            self.assertEqual(reopen_resp.status, 200)
            reopened = await app_state.db.user_report.find_one({"_id": "RePo1234"})
            self.assertEqual("open", reopened["status"])
            self.assertEqual("mod", reopened["inquiryBy"])

    async def test_reports_page_rejects_non_admin(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")

        self.set_session_user("alice")
        denied = await self.client.get("/reports")
        self.assertEqual(denied.status, 403)


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)
