import json
import time
import unittest
from collections import deque
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


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

    async def test_mod_public_chat_renders_lobby_and_tournament_lines(self):
        app_state = get_app_state(self.app)
        app_state.users["mod"] = User(app_state, username="mod")
        app_state.lobby.lobbychat = deque(
            [
                {"type": "lobbychat", "user": "bob", "message": "hello lobby"},
                {"type": "lobbychat", "user": "", "message": "system"},
            ]
        )
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

        self.set_session_user("mod")
        with patch("views.mod_public_chat.ADMINS", ["mod"]):
            resp = await self.client.get("/mod/public-chat")
        self.assertEqual(resp.status, 200)
        body = await resp.text()
        self.assertIn("Public Chats", body)
        self.assertIn("hello lobby", body)
        self.assertIn("Arena One", body)
        self.assertIn("hello arena", body)
        self.assertIn("white vs black", body)
        self.assertIn("hello round", body)

    async def test_public_chat_timeout_lobby(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target
        app_state.lobby.lobbychat = deque(
            [{"type": "lobbychat", "user": "target", "message": "spam message"}]
        )

        self.set_session_user("mod")
        with patch("mod_public_chat_api.ADMINS", ["mod"]), patch("admin.ADMINS", ["mod"]):
            resp = await self.client.post(
                "/api/mod/public-chat/timeout",
                data={
                    "chan": "lobby",
                    "roomId": "lobby",
                    "userId": "target",
                    "reason": "spam",
                    "text": "spam message",
                },
            )

        self.assertEqual(resp.status, 200)
        self.assertGreater(target.silence, 0)
        self.assertIn("timed out 15 minutes", app_state.lobby.lobbychat[-1]["message"])

    async def test_public_chat_timeout_tournament(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target

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

    async def test_public_chat_timeout_round(self):
        app_state = get_app_state(self.app)
        mod = User(app_state, username="mod")
        target = User(app_state, username="target")
        app_state.users[mod.username] = mod
        app_state.users[target.username] = target
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
            patch("mod_public_chat_api.round_broadcast", new=AsyncMock()) as broadcast_mock,
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
