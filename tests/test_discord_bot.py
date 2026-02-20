from __future__ import annotations

import unittest
from typing import cast
from unittest.mock import AsyncMock, Mock, patch

import discord

from discord_bot import DiscordBot


class DiscordBotTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_bughouse_missing_access_is_swallowed_and_channel_is_muted(self):
        bot = DiscordBot(app_state=object())
        self.addAsyncCleanup(bot.close)

        bot.wait_until_ready = AsyncMock()
        bot.pychess_lobby_channel = cast(discord.abc.Messageable, AsyncMock())

        game_seek_channel = cast(discord.abc.Messageable, AsyncMock())
        setattr(game_seek_channel, "id", 111)
        bot.game_seek_channel = game_seek_channel

        bughouse_channel = cast(discord.abc.Messageable, AsyncMock())
        setattr(bughouse_channel, "id", 222)
        forbidden = discord.Forbidden(Mock(status=403, reason="Forbidden"), "Missing Access")
        bughouse_channel.send.side_effect = forbidden
        bot.bughouse_channel = bughouse_channel

        role = Mock()
        role.mention = "@bughouse"
        guild = Mock()
        guild.get_role.return_value = role
        bot.get_guild = Mock(return_value=guild)

        with patch("discord_bot.log.warning") as warning:
            await bot.send_to_discord("create_seek", "bughouse 5+3 vitalist_rat")
            await bot.send_to_discord("create_seek", "bughouse 5+3 vitalist_rat")

        self.assertEqual(2, game_seek_channel.send.await_count)
        self.assertEqual(1, bughouse_channel.send.await_count)
        warning.assert_called_once_with(
            "Discord missing access for channel %s while sending %s", 222, "bughouse seek"
        )
