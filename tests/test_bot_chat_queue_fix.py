import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger

from wsr import handle_roundchat

test_logger.init_test_logger()


class RoundChatBotQueueTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_roundchat_enqueues_valid_json_for_bots(self) -> None:
        bot_queue: asyncio.Queue[str] = asyncio.Queue()
        bot = SimpleNamespace(bot=True, username="Fairy-Stockfish", game_queues={"g1": bot_queue})
        human = SimpleNamespace(bot=False, username="black", send_game_message=AsyncMock())
        sender = SimpleNamespace(username="white")
        app_state = SimpleNamespace(users={bot.username: bot, human.username: human})

        class RecordingGame:
            id = "g1"
            wplayer = bot
            bplayer = human

            def __init__(self) -> None:
                self.messages: list[dict[str, object]] = []

            def handle_chat_message(self, message: dict[str, object]) -> None:
                self.messages.append(message)

        game = RecordingGame()

        with patch("wsr.round_broadcast", new=AsyncMock()):
            await handle_roundchat(
                app_state,
                None,
                sender,
                {
                    "type": "roundchat",
                    "gameId": "g1",
                    "message": 'All of the first moves are "@"s',
                    "room": "player",
                },
                game,
            )

        queued = await bot_queue.get()
        event = json.loads(queued)
        self.assertEqual(event["type"], "chatLine")
        self.assertEqual(event["username"], "white")
        self.assertEqual(event["room"], "player")
        self.assertEqual(event["text"], 'All of the first moves are "@"s')


if __name__ == "__main__":
    unittest.main(verbosity=2)
