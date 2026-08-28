import json
import time
import unittest
from collections import deque
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User

from server import make_app


class ModPublicChatTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_mod_public_chat_requires_admin(self):
        app_state = get_app_state(self.app)
        app_state.users["alice"] = User(app_state, username="alice")

        self.set_session_user("alice")
        with patch("views.mod_public_chat.ADMINS", ["mod"]):
            resp = await self.client.get("/mod/public-chat")
        self.assertEqual(resp.status, 403)

    async def test_mod_public_chat_renders_round_and_tournament_lines(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        app_state.tournaments["t1234567"] = SimpleNamespace(
            id="t1234567",
            name="Arena One",
            status_name="started",
            tourneychat=[{"type": "lobbychat", "user": "carol", "message": "hello arena"}],
        )
        app_state.games["g1234567"] = SimpleNamespace(
            id="g1234567",
            corr=True,
            wplayer=SimpleNamespace(username="white"),
            bplayer=SimpleNamespace(username="black"),
            variant="chess",
            messages=deque([{"type": "roundchat", "user": "dave", "message": "hello round"}]),
        )
        app_state.simuls["s1234567"] = SimpleNamespace(
            id="s1234567",
            name="Simul One",
            status=0,
            tourneychat=[{"type": "lobbychat", "user": "eve", "message": "hello simul"}],
        )

        self.set_session_user("mod")
        with patch("views.mod_public_chat.ADMINS", ["mod"]):
            resp = await self.client.get("/mod/public-chat")
        self.assertEqual(resp.status, 200)
        body = await resp.text()
        self.assertIn("Public Chats", body)
        self.assertNotIn("Lobby Chat", body)
        self.assertIn("Arena One", body)
        self.assertIn("hello arena", body)
        self.assertIn("white vs black", body)
        self.assertIn("hello round", body)
        self.assertIn("Simul One", body)
        self.assertIn("hello simul", body)
        self.assertIn(
            'class="admin-nav__item active" href="/mod/public-chat"',
            body,
        )
        self.assertIn('href="/admin/users"', body)
        self.assertIn("admin.css", body)

    async def test_public_chat_timeout_rejects_retired_lobby_channel(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")

        self.set_session_user("mod")
        with patch("mod_public_chat_api.ADMINS", ["mod"]):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "lobby",
                    "roomId": "lobby",
                    "userId": "target",
                    "reason": "spam",
                },
            )

        self.assertEqual(resp.status, 400)

    async def test_public_chat_timeout_tournament(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target
        await app_state.db.user.insert_one(
            {"_id": "target", "username_lower": "target", "enabled": True}
        )

        tournament = SimpleNamespace(
            id="A1B2C3D4",
            tourneychat=[{"type": "lobbychat", "user": "target", "message": "abuse"}],
            broadcast=AsyncMock(),
        )

        self.set_session_user("mod")
        with (
            patch("mod_public_chat_api.ADMINS", ["mod"]),
            patch("admin.ADMINS", ["mod"]),
            patch("mod_public_chat_api.load_tournament", new=AsyncMock(return_value=tournament)),
        ):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "tournament",
                    "roomId": "A1B2C3D4",
                    "userId": "target",
                    "reason": "insult",
                    "text": "abuse",
                },
            )

        self.assertEqual(resp.status, 200)
        tournament.broadcast.assert_awaited_once()
        self.assertIn("timed out 15 minutes", tournament.tourneychat[-1]["message"])

    async def test_public_chat_timeout_simul(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target
        await app_state.db.user.insert_one(
            {"_id": "target", "username_lower": "target", "enabled": True}
        )
        simul = SimpleNamespace(
            id="S1M2U3L4",
            tourneychat=[{"type": "lobbychat", "user": "target", "message": "abuse"}],
            broadcast=AsyncMock(),
        )
        await app_state.db.simul_chat.insert_one(
            {"sid": simul.id, "type": "lobbychat", "user": "target", "message": "abuse"}
        )

        self.set_session_user("mod")
        with (
            patch("mod_public_chat_api.ADMINS", ["mod"]),
            patch("admin.ADMINS", ["mod"]),
            patch("mod_public_chat_api.load_simul", new=AsyncMock(return_value=simul)),
        ):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "simul",
                    "roomId": simul.id,
                    "userId": "target",
                    "reason": "spam",
                    "text": "abuse",
                },
            )

        self.assertEqual(resp.status, 200)
        simul.broadcast.assert_awaited_once()
        self.assertIn("timed out 15 minutes", simul.tourneychat[-1]["message"])
        self.assertIsNone(
            await app_state.db.simul_chat.find_one({"sid": simul.id, "user": "target"})
        )
        persisted_notice = await app_state.db.simul_chat.find_one({"sid": simul.id, "user": ""})
        self.assertIsNotNone(persisted_notice)

    async def test_public_chat_timeout_offline_user_sweeps_loaded_public_chats(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        await app_state.db.user.insert_one(
            {"_id": "target", "username_lower": "target", "enabled": True}
        )

        source = SimpleNamespace(
            id="SRC12345",
            tourneychat=[
                {"type": "lobbychat", "user": "target", "message": "source spam"},
                {"type": "lobbychat", "user": "other", "message": "keep me"},
            ],
            broadcast=AsyncMock(),
        )
        other_tournament = SimpleNamespace(
            id="OTH12345",
            tourneychat=[{"type": "lobbychat", "user": "target", "message": "arena spam"}],
            broadcast=AsyncMock(),
        )
        simul = SimpleNamespace(
            id="SIM12345",
            tourneychat=[{"type": "lobbychat", "user": "target", "message": "simul spam"}],
            broadcast=AsyncMock(),
        )
        game = SimpleNamespace(
            id="GAM12345",
            corr=True,
            messages=deque(
                [
                    {
                        "type": "roundchat",
                        "room": "spectator",
                        "user": "target",
                        "message": "round spam",
                    }
                ]
            ),
        )
        app_state.tournaments[other_tournament.id] = other_tournament
        app_state.simuls[simul.id] = simul
        app_state.games[game.id] = game

        await app_state.db.tournament_chat.insert_many(
            [
                {"tid": source.id, "type": "lobbychat", "user": "target", "message": "source spam"},
                {
                    "tid": other_tournament.id,
                    "type": "lobbychat",
                    "user": "target",
                    "message": "arena spam",
                },
            ]
        )
        await app_state.db.simul_chat.insert_one(
            {"sid": simul.id, "type": "lobbychat", "user": "target", "message": "simul spam"}
        )

        self.set_session_user("mod")
        with (
            patch("mod_public_chat_api.ADMINS", ["mod"]),
            patch("admin.ADMINS", ["mod"]),
            patch("mod_public_chat_api.load_tournament", new=AsyncMock(return_value=source)),
            patch(
                "public_chat_moderation.round_broadcast", new=AsyncMock()
            ) as round_broadcast_mock,
        ):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "tournament",
                    "roomId": source.id,
                    "userId": "target",
                    "reason": "spam",
                    "text": "source spam",
                },
            )

        self.assertEqual(resp.status, 200)
        self.assertEqual(["other", ""], [line["user"] for line in source.tourneychat])
        self.assertEqual([], other_tournament.tourneychat)
        self.assertEqual([], simul.tourneychat)
        self.assertEqual("target", game.messages[0]["user"])
        source.broadcast.assert_awaited_once()
        other_tournament.broadcast.assert_awaited_once()
        simul.broadcast.assert_awaited_once()
        round_broadcast_mock.assert_not_awaited()
        self.assertEqual(
            0,
            await app_state.db.tournament_chat.count_documents({"user": "target"}),
        )
        self.assertEqual(0, await app_state.db.simul_chat.count_documents({"user": "target"}))
        persisted_notice = await app_state.db.tournament_chat.find_one(
            {"tid": source.id, "user": ""}
        )
        self.assertIsNotNone(persisted_notice)
        target_doc = await app_state.db.user.find_one({"_id": "target"})
        self.assertGreater(target_doc["chatTimeoutUntil"], datetime.now(UTC))
        target = await app_state.users.get("target")
        self.assertGreater(target.silence, 0)

    async def test_public_chat_timeout_round(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target
        await app_state.db.user.insert_one(
            {"_id": "target", "username_lower": "target", "enabled": True}
        )
        game = SimpleNamespace(
            id="g1234567",
            corr=True,
            messages=deque(
                [{"type": "roundchat", "room": "spectator", "user": "target", "message": "abuse"}]
            ),
        )
        app_state.games[game.id] = game

        self.set_session_user("mod")
        with (
            patch("mod_public_chat_api.ADMINS", ["mod"]),
            patch("admin.ADMINS", ["mod"]),
            patch("public_chat_moderation.round_broadcast", new=AsyncMock()) as broadcast_mock,
        ):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "round",
                    "roomId": game.id,
                    "userId": "target",
                    "reason": "insult",
                    "text": "abuse",
                },
            )

        self.assertEqual(resp.status, 200)
        broadcast_mock.assert_awaited_once()
        self.assertIn("timed out 15 minutes", game.messages[-1]["message"])
        self.assertEqual(game.messages[-1]["type"], "roundchat")
        self.assertEqual(game.messages[-1]["room"], "player")


if __name__ == "__main__":
    unittest.main(verbosity=2)
