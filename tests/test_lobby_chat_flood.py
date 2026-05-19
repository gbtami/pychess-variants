import unittest
from collections import deque
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from wsl import handle_lobbychat


class _TargetUser:
    def __init__(self) -> None:
        self.silenced = 0

    def set_silence(self) -> None:
        self.silenced += 1


class LobbyChatFloodTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_lobbychat_drops_rejected_flood_message(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: False),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        user = SimpleNamespace(username="tester", anon=False, silence=0)
        ws = object()
        payload = {"type": "lobbychat", "message": "repeat repeat repeat"}

        with patch("wsl.ADMINS", []):
            await handle_lobbychat(app_state, ws, user, payload)

        app_state.lobby.lobby_chat_save.assert_not_awaited()
        app_state.lobby.lobby_broadcast.assert_not_awaited()
        app_state.discord.send_to_discord.assert_not_awaited()

    async def test_lobbychat_sanitizes_blacklisted_links(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        user = SimpleNamespace(username="tester", anon=False, silence=0)
        ws = object()
        payload = {"type": "lobbychat", "message": "visit https://tinyurl.com/abc"}

        with patch("wsl.ADMINS", []):
            await handle_lobbychat(app_state, ws, user, payload)

        app_state.lobby.lobby_chat_save.assert_awaited_once()
        saved = app_state.lobby.lobby_chat_save.await_args.args[0]
        self.assertEqual("visit [redacted]", saved["message"])
        app_state.lobby.lobby_broadcast.assert_awaited_once()
        broadcast = app_state.lobby.lobby_broadcast.await_args.args[0]
        self.assertEqual("visit [redacted]", broadcast["message"])
        app_state.discord.send_to_discord.assert_awaited_once_with(
            "lobbychat", "visit [redacted]", "tester"
        )

    async def test_admin_silence_matches_mixed_case_username(self) -> None:
        spammer = _TargetUser()
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobbychat=deque(
                    [
                        {"type": "lobbychat", "user": "FrogTheBadass", "message": "spam"},
                        {"type": "lobbychat", "user": "other", "message": "ok"},
                    ]
                ),
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
            users={"FrogTheBadass": spammer},
        )
        admin_user = SimpleNamespace(username="admin", anon=False, silence=0)
        ws = object()
        payload = {"type": "lobbychat", "message": "/silence @frogthebadass"}

        with patch("wsl.ADMINS", ["admin"]):
            await handle_lobbychat(app_state, ws, admin_user, payload)

        self.assertEqual(1, spammer.silenced)
        app_state.lobby.lobby_chat_save.assert_not_awaited()
        app_state.discord.send_to_discord.assert_not_awaited()
        app_state.lobby.lobby_broadcast.assert_awaited_once()

        sent = app_state.lobby.lobby_broadcast.await_args.args[0]
        self.assertEqual("fullchat", sent["type"])
        self.assertEqual("other", sent["lines"][0]["user"])
        self.assertEqual("", sent["lines"][-1]["user"])
        self.assertIn("FrogTheBadass was timed out 15 minutes", sent["lines"][-1]["message"])

    async def test_shadowbanned_user_sees_only_their_own_lobby_message(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        ws = object()
        user = SimpleNamespace(
            username="shadowed",
            anon=False,
            silence=0,
            shadowban=True,
            lobby_sockets={ws},
        )
        payload = {"type": "lobbychat", "message": "visible only to me"}

        with patch("wsl.ADMINS", []), patch("wsl.ws_send_json_many", new=AsyncMock()) as send_many:
            await handle_lobbychat(app_state, ws, user, payload)

        send_many.assert_awaited_once()
        sent_sockets, sent_payload = send_many.await_args.args
        self.assertEqual({ws}, sent_sockets)
        self.assertEqual("visible only to me", sent_payload["message"])
        app_state.lobby.lobby_chat_save.assert_not_awaited()
        app_state.lobby.lobby_broadcast.assert_not_awaited()
        app_state.discord.send_to_discord.assert_not_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
