from __future__ import annotations

import asyncio
import unittest

from pychess_global_app_state import PychessGlobalAppState


class DiscordStartupTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_run_discord_bot_retries_after_error_until_cancelled(self):
        class FlakyBot:
            def __init__(self) -> None:
                self.calls = 0

            async def start(self, token: str) -> None:
                self.calls += 1
                if self.calls == 1:
                    raise RuntimeError("transient startup failure")
                raise asyncio.CancelledError()

        holder = type("Holder", (), {})()
        bot = FlakyBot()

        run_discord_bot = PychessGlobalAppState._PychessGlobalAppState__run_discord_bot
        with self.assertRaises(asyncio.CancelledError):
            await run_discord_bot(holder, bot, "token-123")

        self.assertEqual(bot.calls, 2)

    async def test_run_discord_bot_returns_when_start_exits_cleanly(self):
        class CleanBot:
            def __init__(self) -> None:
                self.calls = 0

            async def start(self, token: str) -> None:
                self.calls += 1
                return

        holder = type("Holder", (), {})()
        bot = CleanBot()

        run_discord_bot = PychessGlobalAppState._PychessGlobalAppState__run_discord_bot
        await run_discord_bot(holder, bot, "token-123")
        self.assertEqual(bot.calls, 1)


if __name__ == "__main__":
    unittest.main()
