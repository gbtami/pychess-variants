from __future__ import annotations

import asyncio
import collections
import gettext
import logging
import queue
from typing import List, Set

from aiohttp import web
import os
from datetime import timedelta, timezone, datetime, date
from operator import neg

import jinja2
from pythongettext.msgfmt import Msgfmt, PoSyntaxError
from sortedcollections import ValueSortedDict

from ai import BOT_task
from const import (
    NONE_USER,
    VARIANTS,
    LANGUAGES,
    MAX_CHAT_LINES,
    MONTHLY,
    ARENA,
    WEEKLY,
    SHIELD,
    T_CREATED,
    T_STARTED,
    SCHEDULE_MAX_DAYS,
    ABORTED,
)
from discord_bot import DiscordBot, FakeDiscordBot
from game import Game
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from generate_shield import generate_shield
from lobby import Lobby
from scheduler import (
    MONTHLY_VARIANTS,
    SEATURDAY,
    PAUSED_MONTHLY_VARIANTS,
    WEEKLY_VARIANTS,
    SHIELDS,
    new_scheduled_tournaments,
    create_scheduled_tournaments,
)
from seek import Seek
from settings import DEV, FISHNET_KEYS, static_url, DISCORD_TOKEN
from tournament import Tournament
from tournaments import translated_tournament_name, get_scheduled_tournaments, load_tournament
from twitch import Twitch
from user import User
from users import Users, NotInDbUsers
from utils import load_game, MyWebSocketResponse
from blogs import BLOGS
from videos import VIDEOS
from youtube import Youtube


log = logging.getLogger(__name__)


class PychessGlobalAppState:
    def __init__(self, app: web.Application):
        from typedefs import db_key

        self.app = app

        self.shutdown = False
        self.tournaments_loaded = asyncio.Event()

        self.db = app[db_key]
        self.users = self.__init_users()
        self.disable_new_anons = False
        self.lobby = Lobby(self)
        # one dict per tournament! {tournamentId: {user.username: user.tournament_sockets, ...}, ...}
        self.tourneysockets: dict[str, MyWebSocketResponse] = {}

        # translated scheduled tournament names {(variant, frequency, t_type): tournament.name, ...}
        self.tourneynames: dict[str, dict] = {lang: {} for lang in LANGUAGES}

        self.tournaments: dict[str, Tournament] = {}

        self.tourney_calendar = None

        # lichess allows 7 team message per week, so we will send one (cumulative) per day only
        # TODO: save/restore from db
        self.sent_lichess_team_msg: List[date] = []

        # one deque per tournament! {tournamentId: collections.deque([], MAX_CHAT_LINES), ...}
        self.tourneychat: dict[str, collections.deque] = {}

        self.seeks: dict[int, Seek] = {}
        self.games: dict[str, Game] = {}
        self.invites: dict[str, Seek] = {}
        self.game_channels: Set[queue] = set()
        self.invite_channels: Set[queue] = set()
        self.highscore = {variant: ValueSortedDict(neg) for variant in VARIANTS}
        self.get_top10_users = True
        self.crosstable: dict[str, object] = {}
        self.shield = {}
        self.shield_owners = {}  # {variant: username, ...}
        self.daily_puzzle_ids = {}  # {date: puzzle._id, ...}

        # TODO: save/restore monthly stats from db when current month is over
        self.stats = {}
        self.stats_humans = {}

        # counters for games
        self.g_cnt = [0]

        # last game played
        self.tv: str = None

        self.twitch = self.__init_twitch()
        self.youtube = Youtube(self.app)

        # fishnet active workers
        self.workers = set()
        # fishnet works
        self.fishnet_works = {}
        # fishnet worker tasks
        self.fishnet_queue = asyncio.PriorityQueue()
        # fishnet workers monitor
        self.fishnet_monitor = self.__init_fishnet_monitor()
        self.fishnet_versions = {}

        # Configure translations and templating.
        self.gettext = {}
        self.jinja = {}

        # self.discord:
        self.__init_discord()

        #####
        self.__start_bots()
        self.__init_translations()

        self.started_at = datetime.now(timezone.utc)

    async def init_from_db(self):
        if self.db is None:
            return

        # Read tournaments, users and highscore from db
        try:
            await self.db.tournament.create_index("startsAt")
            await self.db.tournament.create_index("status")

            cursor = self.db.tournament.find(
                {"$or": [{"status": T_STARTED}, {"status": T_CREATED}]}
            )
            cursor.sort("startsAt", -1)
            to_date = (datetime.now() + timedelta(days=SCHEDULE_MAX_DAYS)).date()
            async for doc in cursor:
                if doc["status"] == T_STARTED or (
                    doc["status"] == T_CREATED and doc["startsAt"].date() <= to_date
                ):
                    await load_tournament(self, doc["_id"])
            self.tournaments_loaded.set()

            already_scheduled = await get_scheduled_tournaments(self)
            new_tournaments_data = new_scheduled_tournaments(already_scheduled)
            await create_scheduled_tournaments(self, new_tournaments_data)

            asyncio.create_task(generate_shield(self))

            db_collections = await self.db.list_collection_names()

            if "highscore" not in db_collections:
                await generate_highscore(self)
            cursor = self.db.highscore.find()
            async for doc in cursor:
                if doc["_id"] in VARIANTS:
                    self.highscore[doc["_id"]] = ValueSortedDict(neg, doc["scores"])

            if "crosstable" not in db_collections:
                await generate_crosstable(self.db)
            cursor = self.db.crosstable.find()
            async for doc in cursor:
                self.crosstable[doc["_id"]] = doc

            if "dailypuzzle" not in db_collections:
                try:
                    await self.db.create_collection("dailypuzzle", capped=True, size=50000, max=365)
                except NotImplementedError:
                    await self.db.create_collection("dailypuzzle")
            else:
                cursor = self.db.dailypuzzle.find()
                docs = await cursor.to_list(length=365)
                self.daily_puzzle_ids = {doc["_id"]: doc["puzzleId"] for doc in docs}

            if "lobbychat" not in db_collections:
                try:
                    await self.db.create_collection(
                        "lobbychat", capped=True, size=100000, max=MAX_CHAT_LINES
                    )
                except NotImplementedError:
                    await self.db.create_collection("lobbychat")
            else:
                cursor = self.db.lobbychat.find(
                    projection={
                        "_id": 0,
                        "type": 1,
                        "user": 1,
                        "message": 1,
                        "room": 1,
                        "time": 1,
                    }
                )
                docs = await cursor.to_list(length=MAX_CHAT_LINES)
                self.lobby.lobbychat = docs

            await self.db.game.create_index("us")
            await self.db.game.create_index("r")
            await self.db.game.create_index("v")
            await self.db.game.create_index("y")
            await self.db.game.create_index("by")
            await self.db.game.create_index("c")

            if "notify" not in db_collections:
                await self.db.create_collection("notify")
            await self.db.notify.create_index("notifies")
            await self.db.notify.create_index("expireAt", expireAfterSeconds=0)

            if "seek" not in db_collections:
                await self.db.create_collection("seek")
            await self.db.seek.create_index("expireAt", expireAfterSeconds=0)

            # Read correspondence seeks
            async for doc in self.db.seek.find():
                user = await self.users.get(doc["user"])
                if user is not None:
                    seek = Seek(
                        user,
                        doc["variant"],
                        fen=doc["fen"],
                        color=doc["color"],
                        day=doc["day"],
                        rated=doc["rated"],
                        chess960=doc["chess960"],
                        player1=user,
                        expire_at=doc.get("expireAt"),
                    )
                    self.seeks[seek.id] = seek
                    user.seeks[seek.id] = seek

            # Read games in play and start their clocks
            cursor = self.db.game.find({"r": "d"})
            cursor.sort("d", -1)
            today = datetime.now(timezone.utc)

            async for doc in cursor:
                # Don't load old uninished games if they are NOT corr games
                corr = doc.get("c", False)
                if doc["d"] < today - timedelta(days=1) and not corr:
                    continue

                if doc["s"] < ABORTED:
                    try:
                        game = await load_game(self, doc["_id"])
                        if game is None:
                            continue
                        self.games[doc["_id"]] = game
                        if corr:
                            game.wplayer.correspondence_games.append(game)
                            game.bplayer.correspondence_games.append(game)
                            game.stopwatch.restart(from_db=True)
                        else:
                            game.stopwatch.restart()
                    except NotInDbUsers:
                        log.error("Failed toload game %s", doc["_id"])

            if "video" not in db_collections:
                if DEV:
                    await self.db.video.drop()
                await self.db.video.insert_many(VIDEOS)

            if "blog" not in db_collections:
                if DEV:
                    await self.db.blog.drop()
                await self.db.blog.insert_many(BLOGS)
                await self.db.blog.create_index("date")

            if "fishnet" in db_collections:
                cursor = self.db.fishnet.find()
                async for doc in cursor:
                    FISHNET_KEYS[doc["_id"]] = doc["name"]

        except Exception:
            print("Maybe mongodb is not running...")
            raise

    def __init_translations(self):
        base = os.path.dirname(__file__)
        for lang in LANGUAGES:
            # Generate compiled mo file
            folder = os.path.join(base, "../lang/", lang, "LC_MESSAGES")
            poname = os.path.join(folder, "server.po")
            moname = os.path.join(folder, "server.mo")
            try:
                with open(poname, "rb") as po_file:
                    po_lines = [line for line in po_file if line[:8] != b"#, fuzzy"]
                    mo = Msgfmt(po_lines).get()
                    with open(moname, "wb") as mo_file:
                        mo_file.write(mo)
            except PoSyntaxError:
                log.error("PoSyntaxError in %s", poname, stack_info=True, exc_info=True)

            # Create translation class
            try:
                translation = gettext.translation("server", localedir="lang", languages=[lang])
            except FileNotFoundError:
                log.warning("Missing translations file for lang %s", lang)
                translation = gettext.NullTranslations()

            env = jinja2.Environment(
                enable_async=True,
                extensions=["jinja2.ext.i18n"],
                loader=jinja2.FileSystemLoader("templates"),
                autoescape=jinja2.select_autoescape(["html"]),
            )
            env.install_gettext_translations(translation, newstyle=True)
            env.globals["static"] = static_url

            self.jinja[lang] = env
            self.gettext[lang] = translation

            translation.install()

            for variant in VARIANTS + PAUSED_MONTHLY_VARIANTS:
                if (
                    variant in MONTHLY_VARIANTS
                    or variant in SEATURDAY
                    or variant in PAUSED_MONTHLY_VARIANTS
                ):
                    tname = translated_tournament_name(variant, MONTHLY, ARENA, translation)
                    self.tourneynames[lang][(variant, MONTHLY, ARENA)] = tname
                if variant in SEATURDAY or variant in WEEKLY_VARIANTS:
                    tname = translated_tournament_name(variant, WEEKLY, ARENA, translation)
                    self.tourneynames[lang][(variant, WEEKLY, ARENA)] = tname
                if variant in SHIELDS:
                    tname = translated_tournament_name(variant, SHIELD, ARENA, translation)
                    self.tourneynames[lang][(variant, SHIELD, ARENA)] = tname

    def __start_bots(self):
        rm = self.users["Random-Mover"]
        ai = self.users["Fairy-Stockfish"]
        asyncio.create_task(BOT_task(ai, self))
        asyncio.create_task(BOT_task(rm, self))

    def __init_fishnet_monitor(self) -> dict:
        result = {}
        print(FISHNET_KEYS)
        for key in FISHNET_KEYS:
            result[FISHNET_KEYS[key]] = collections.deque([], 50)
        return result

    def __init_discord(self):
        if self.db is None:
            self.discord = FakeDiscordBot()

        # create Discord bot
        if DEV:
            self.discord = FakeDiscordBot()
        else:
            bot = DiscordBot(self)
            self.discord = bot
            asyncio.create_task(bot.start(DISCORD_TOKEN))

    def __init_twitch(self) -> Twitch:
        result = Twitch(self.app)
        if not DEV:
            asyncio.create_task(result.init_subscriptions())
        return result

    def __init_users(self) -> Users:
        result = Users(self)
        result["PyChess"] = User(self, bot=True, username="PyChess")
        result["Random-Mover"] = User(self, bot=True, username="Random-Mover")
        result["Fairy-Stockfish"] = User(self, bot=True, username="Fairy-Stockfish")
        result["Discord-Relay"] = User(self, anon=True, username="Discord-Relay")
        result["Random-Mover"].online = True

        # To handle old anon user sessions with names prefixed with "Anon-" (hyphen!)
        # we will use this disabled(!) technical NONE_USER
        result[NONE_USER] = User(self, anon=True, username=NONE_USER)
        result[NONE_USER].enabled = False
        return result

    def online_count(self):
        return sum((1 for user in self.users.values() if user.online))

    def __str__(self):
        return self.__stringify(str)

    def __repr__(self):
        return self.__stringify(repr)

    def __stringify(self, strfunc):
        attribs = vars(self)
        values = []
        for attr in attribs:
            value = getattr(self, attr)
            values.append(strfunc(value))
        clsname = type(self).__name__
        variabs = ", ".join(values)
        return "{}({})".format(clsname, variabs)
