from __future__ import annotations
from typing import TYPE_CHECKING


import logging
from time import time

import discord
from discord.ext.commands import Bot

from const import CATEGORIES

if TYPE_CHECKING:
    from discord import Guild, Message, Role
    from pychess_global_app_state import PychessGlobalAppState

log = logging.getLogger("discord")
log.setLevel(logging.WARNING)

# pychess-players Discord server
SERVER_ID = 634298688663191582

PYCHESS_LOBBY_CHANNEL_ID = 653203449927827456
GAME_SEEK_CHANNEL_ID = 823862902648995910
TOURNAMENT_CHANNEL_ID = 861234739820888074
ANNOUNCEMENT_CHANNEL_ID = 865964574507008000
BUGHOUSE_CHANNEL_ID = 1332731143048528065

ROLES = {
    "gladiator": 867894147900637215,
    "crazyhouse": 658544490830757919,
    "capablanca": 658544637467951124,
    "grand": 658544867269541899,
    "atomic": 867889563087274034,
    "hoppelpoppel": 867889843357876254,
    "xiangqi": 658544904011644938,
    "shogi": 658544950677340161,
    "shogun": 675143932912599041,
    "seirawan": 658753848982110209,
    "shako": 658544983623860235,
    "janggi": 695975424433455145,
    "makruk": 658545040234119178,
    "sittuyin": 658545093011046420,
    "orda": 702977517018939444,
    "synochess": 730903272080277524,
    "shinobi": 867889352704131132,
    "empire": 867892839493009478,
    "chess": 658545185571209221,
    "chak": 940232991182041098,
    "chennis": 940233624048009236,
    "bughouse": 1416061701966790716,
}

intents = discord.Intents(messages=True, guilds=True, message_content=True)


class FakeDiscordBot:
    async def send_to_discord(self, msg_type: str, msg: str, user: str | None = None) -> None:
        print(msg_type, user, msg)


class DiscordBot(Bot):
    def __init__(self, app_state: PychessGlobalAppState) -> None:
        Bot.__init__(self, command_prefix="!", intents=intents)

        self.app_state = app_state

        self.pychess_lobby_channel: discord.abc.Messageable | None = None
        self.game_seek_channel: discord.abc.Messageable | None = None
        self.tournament_channel: discord.abc.Messageable | None = None
        self.announcement_channel: discord.abc.Messageable | None = None
        self.bughouse_channel: discord.abc.Messageable | None = None
        self._inaccessible_channel_ids: set[int] = set()

    async def on_message(self, msg: Message) -> None:
        log.debug("---on_message() %s", msg)
        if msg.author.id == self.user.id or msg.channel.id != PYCHESS_LOBBY_CHANNEL_ID:
            log.debug("---self.user msg OR other channel.id -> return")
            return
        await self.app_state.lobby.lobby_chat(
            "Discord-Relay", "%s: %s" % (msg.author.display_name, msg.content), int(time())
        )

    def get_channels(self) -> None:
        # Get the pychess-lobby channel
        lobby_channel = self.get_channel(PYCHESS_LOBBY_CHANNEL_ID)
        self.pychess_lobby_channel = (
            lobby_channel if isinstance(lobby_channel, discord.abc.Messageable) else None
        )
        log.debug("pychess_lobby_channel is: %s", self.pychess_lobby_channel)

        game_seek_channel = self.get_channel(GAME_SEEK_CHANNEL_ID)
        self.game_seek_channel = (
            game_seek_channel if isinstance(game_seek_channel, discord.abc.Messageable) else None
        )
        log.debug("game_seek_channel is: %s", self.game_seek_channel)

        tournament_channel = self.get_channel(TOURNAMENT_CHANNEL_ID)
        self.tournament_channel = (
            tournament_channel if isinstance(tournament_channel, discord.abc.Messageable) else None
        )
        log.debug("tournament_channel is: %s", self.tournament_channel)

        announcement_channel = self.get_channel(ANNOUNCEMENT_CHANNEL_ID)
        self.announcement_channel = (
            announcement_channel
            if isinstance(announcement_channel, discord.abc.Messageable)
            else None
        )
        log.debug("announcement_channel is: %s", self.announcement_channel)

        bughouse_channel = self.get_channel(BUGHOUSE_CHANNEL_ID)
        self.bughouse_channel = (
            bughouse_channel if isinstance(bughouse_channel, discord.abc.Messageable) else None
        )
        log.debug("bughouse_channel is: %s", self.bughouse_channel)

    async def send_to_discord(self, msg_type: str, msg: str, user: str | None = None) -> None:
        await self.wait_until_ready()

        if self.pychess_lobby_channel is None:
            self.get_channels()

        if (
            self.pychess_lobby_channel is not None
            and msg_type == "lobbychat"
            and user
            and user != "Discord-Relay"
        ):
            log.debug("+++ lobbychat msg: %s %s", user, msg)
            await self._safe_send(
                self.pychess_lobby_channel, "**%s**: %s" % (user, msg), "lobbychat"
            )

        elif self.game_seek_channel is not None and msg_type in ("create_seek", "accept_seek"):
            log.debug("+++ seek msg: %s", msg)
            await self._safe_send(self.game_seek_channel, "%s" % msg, "seek")

            if (
                self.bughouse_channel is not None
                and msg_type == "create_seek"
                and "bughouse" in msg
            ):
                guild: Guild | None = self.get_guild(SERVER_ID)
                role: Role | None = guild.get_role(ROLES["bughouse"]) if guild else None

                log.debug("+++ bug seek msg: %s", msg)
                mention = "%s " % role.mention if role is not None else ""
                await self._safe_send(
                    self.bughouse_channel, "%s%s" % (mention, msg), "bughouse seek"
                )

        elif self.tournament_channel is not None and msg_type == "create_tournament":
            log.debug("+++ create_tournament msg: %s", msg)
            await self._safe_send(self.tournament_channel, "%s" % msg, "create_tournament")

        elif self.tournament_channel is not None and msg_type == "notify_tournament":
            log.debug("+++ notify_tournament msg: %s", msg)
            await self._safe_send(
                self.tournament_channel,
                "%s %s" % (self.get_role_mentions(msg), msg),
                "notify_tournament",
            )

    async def _safe_send(
        self, channel: discord.abc.Messageable, message: str, context: str
    ) -> None:
        channel_id = getattr(channel, "id", None)
        if isinstance(channel_id, int) and channel_id in self._inaccessible_channel_ids:
            return

        try:
            await channel.send(message)
        except discord.Forbidden:
            if isinstance(channel_id, int):
                self._inaccessible_channel_ids.add(channel_id)
            log.warning(
                "Discord missing access for channel %s while sending %s", channel_id, context
            )
        except discord.HTTPException as exc:
            log.warning("Discord send failed for %s: %s", context, exc)

    def get_role_mentions(self, message: str) -> str:
        guild: Guild | None = self.get_guild(SERVER_ID)
        gladiator_role: Role | None = guild.get_role(ROLES["gladiator"]) if guild else None
        log.debug("guild, role, mention: %s %s %s", guild, gladiator_role, gladiator_role.mention)

        variant = message.split()[0].strip("*")

        if variant in CATEGORIES["shogi"]:
            role: Role | None = guild.get_role(ROLES["shogi"]) if guild else None

        elif variant in CATEGORIES["makruk"]:
            role = guild.get_role(ROLES["makruk"]) if guild else None

        elif variant == "janggi":
            role = guild.get_role(ROLES["janggi"]) if guild else None

        elif variant in CATEGORIES["xiangqi"]:
            role = guild.get_role(ROLES["xiangqi"]) if guild else None

        elif variant == "grand":
            role = guild.get_role(ROLES["grand"]) if guild else None

        elif variant == "shako":
            role = guild.get_role(ROLES["shako"]) if guild else None

        elif variant.startswith("atomic"):
            role = guild.get_role(ROLES["atomic"]) if guild else None

        elif variant.startswith("crazyhouse") or variant in (
            "shouse",
            "capahouse",
            "capahouse960",
            "grandhouse",
        ):
            role = guild.get_role(ROLES["crazyhouse"]) if guild else None

        elif variant.startswith("capablanca"):
            role = guild.get_role(ROLES["capablanca"]) if guild else None

        elif variant.startswith("seirawan"):
            role = guild.get_role(ROLES["seirawan"]) if guild else None

        elif variant == "hoppelpoppel":
            role = guild.get_role(ROLES["hoppelpoppel"]) if guild else None

        elif variant == "shogun":
            role = guild.get_role(ROLES["shogun"]) if guild else None

        elif variant.startswith("orda"):
            role = guild.get_role(ROLES["orda"]) if guild else None

        elif variant == "synochess":
            role = guild.get_role(ROLES["synochess"]) if guild else None

        elif variant == "shinobi":
            role = guild.get_role(ROLES["shinobi"]) if guild else None

        elif variant == "empire":
            role = guild.get_role(ROLES["empire"]) if guild else None

        elif variant == "chak":
            role = guild.get_role(ROLES["chak"]) if guild else None

        elif variant == "chennis":
            role = guild.get_role(ROLES["chennis"]) if guild else None

        elif variant == "bughouse":
            role = guild.get_role(ROLES["bughouse"]) if guild else None

        else:
            role = guild.get_role(ROLES["chess"]) if guild else None

        return "%s %s" % (gladiator_role.mention, role.mention)
