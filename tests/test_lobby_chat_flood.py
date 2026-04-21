import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from wsl import handle_lobbychat


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
