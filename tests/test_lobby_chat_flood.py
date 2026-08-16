import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from wsl import handle_lobbychat


def eligible_user(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "username": "tester",
        "anon": False,
        "silence": 0,
        "shadowban": False,
        "lobby_sockets": set(),
        "created_at": datetime.now(UTC) - timedelta(days=2),
        "count": {"game": 10},
        "perfs": {"atomic": {"nb": 5}},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


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
        user = eligible_user()
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
        user = eligible_user()
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

    async def test_retired_admin_commands_are_rejected_without_becoming_chat(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        admin_user = eligible_user(username="admin")
        ws = object()
        commands = (
            "/silence target",
            "/shadowban target",
            "/unshadowban target",
            "/disable_new_anons true",
            "/stream add channel",
            "/delete Ab123",
            "/baninfo target",
            "/ban target",
            "/unban target",
            "/highscore chess",
            "/crosstable target",
            "/fishnet add worker",
        )

        with (
            patch("wsl.ADMINS", ["admin"]),
            patch("wsl.ws_send_json", new=AsyncMock()) as send,
        ):
            for command in commands:
                await handle_lobbychat(
                    app_state,
                    ws,
                    admin_user,
                    {"type": "lobbychat", "message": command},
                )

        self.assertEqual(len(commands), send.await_count)
        for call in send.await_args_list:
            sent_ws, sent_payload = call.args
            self.assertIs(ws, sent_ws)
            self.assertEqual("error", sent_payload["type"])
            self.assertIn("/admin", sent_payload["message"])
        app_state.lobby.lobby_chat_save.assert_not_awaited()
        app_state.lobby.lobby_broadcast.assert_not_awaited()
        app_state.discord.send_to_discord.assert_not_awaited()

    async def test_admin_plain_message_still_uses_normal_chat_flow(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        admin_user = eligible_user(username="admin")
        ws = object()
        payload = {"type": "lobbychat", "message": "ordinary message"}

        with patch("wsl.ADMINS", ["admin"]):
            await handle_lobbychat(app_state, ws, admin_user, payload)

        app_state.lobby.lobby_chat_save.assert_awaited_once()
        app_state.lobby.lobby_broadcast.assert_awaited_once()
        app_state.discord.send_to_discord.assert_awaited_once_with(
            "lobbychat", "ordinary message", "admin"
        )

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
        user = eligible_user(username="shadowed", shadowban=True, lobby_sockets={ws})
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

    async def test_ineligible_user_message_is_silently_ignored(self) -> None:
        app_state = SimpleNamespace(
            chat_flood=SimpleNamespace(allow_message=lambda source, text: True),
            lobby=SimpleNamespace(
                lobby_chat_save=AsyncMock(),
                lobby_broadcast=AsyncMock(),
            ),
            discord=SimpleNamespace(send_to_discord=AsyncMock()),
        )
        user = eligible_user(count={"game": 9})
        ws = object()
        payload = {"type": "lobbychat", "message": "hello"}

        with patch("wsl.ADMINS", []):
            await handle_lobbychat(app_state, ws, user, payload)

        app_state.lobby.lobby_chat_save.assert_not_awaited()
        app_state.lobby.lobby_broadcast.assert_not_awaited()
        app_state.discord.send_to_discord.assert_not_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
