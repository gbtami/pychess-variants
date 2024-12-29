from __future__ import annotations

import asyncio
import collections
import gettext
import logging
import queue
from typing import List, Set

from aiohttp import web
from aiohttp.web_ws import WebSocketResponse

import os
from datetime import timedelta, timezone, datetime, date
from operator import neg

import jinja2
from pythongettext.msgfmt import Msgfmt, PoSyntaxError
from sortedcollections import ValueSortedDict

from mongomock_motor import AsyncMongoMockClient

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
from broadcast import round_broadcast
from discord_bot import DiscordBot, FakeDiscordBot
from game import Game
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from generate_shield import generate_shield
from lobby import Lobby
from scheduler import (
    MONTHLY_VARIANTS,
    SEATURDAY,
    NEW_MONTHLY_VARIANTS,
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
from typedefs import client_key
from twitch import Twitch
from user import User
from users import Users, NotInDbUsers
from utils import load_game
from blogs import BLOGS
from videos import VIDEOS
from youtube import Youtube


log = logging.getLogger(__name__)

GAME_KEEP_TIME = 1800  # keep game in app[games_key] for GAME_KEEP_TIME secs


class PychessGlobalAppState:
    def __init__(self, app: web.Application):
        from typedefs import db_key

        self.app = app

        self.shutdown = False
        self.tournaments_loaded = asyncio.Event()

        self.db_client = app[client_key]
        self.db = app[db_key]
        self.users = self.__init_users()
        self.disable_new_anons = False
        self.lobby = Lobby(self)
        # one dict per tournament! {tournamentId: {user.username: user.tournament_sockets, ...}, ...}
        self.tourneysockets: dict[str, WebSocketResponse] = {}

        # translated scheduled tournament names {(variant, frequency, t_type): tournament.name, ...}
        self.tourneynames: dict[str, dict] = {lang: {} for lang in LANGUAGES}

        self.tournaments: dict[str, Tournament] = {}

        self.tourney_calendar = None

        # lichess allows 7 team message per week, so we will send one (cumulative) per day only
        # TODO: save/restore from db
        self.sent_lichess_team_msg: List[date] = []

        self.seeks: dict[str, Seek] = {}
        self.auto_pairing_users: dict[User, (int, int)] = {}
        self.auto_pairings: dict[str, set] = {}
        self.games: dict[str, Game] = {}
        self.invites: dict[str, Seek] = {}
        self.game_channels: Set[queue] = set()
        self.invite_channels: Set[queue] = set()
        self.highscore = {variant: ValueSortedDict(neg) for variant in VARIANTS}
        self.shield = {}
        self.shield_owners = {}  # {variant: username, ...}
        self.daily_puzzle_ids = {}  # {date: puzzle._id, ...}

        # monthly game stats per variant
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
            db_collections = await self.db.list_collection_names()

            if "tournament_chat" not in db_collections:
                await self.db.create_collection("tournament_chat")
                await self.db.tournament_chat.create_index("tid")

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
                    # Prevent unit test slowdown when db_client is AsyncMongoMockClient
                    if not isinstance(self.db_client, AsyncMongoMockClient):
                        await load_tournament(self, doc["_id"])
            self.tournaments_loaded.set()

            if not isinstance(self.db_client, AsyncMongoMockClient):
                already_scheduled = await get_scheduled_tournaments(self)
                new_tournaments_data = new_scheduled_tournaments(already_scheduled)
                await create_scheduled_tournaments(self, new_tournaments_data)

                asyncio.create_task(generate_shield(self), name="generate-shield")

            if "highscore" not in db_collections:
                await generate_highscore(self)
            cursor = self.db.highscore.find()
            async for doc in cursor:
                if doc["_id"] in VARIANTS:
                    self.highscore[doc["_id"]] = ValueSortedDict(neg, doc["scores"])

            if "crosstable" not in db_collections:
                await generate_crosstable(self)

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

            # Load auto pairings from database
            async for doc in self.db.autopairing.find():
                variant_tc = tuple(doc["variant_tc"])
                if variant_tc not in self.auto_pairings:
                    self.auto_pairings[variant_tc] = set()

                for username, rrange in doc["users"]:
                    user = await self.users.get(username)
                    self.auto_pairings[variant_tc].add(user)
                    if user not in self.auto_pairing_users:
                        self.auto_pairing_users[user] = rrange

            # Load seeks from database
            async for doc in self.db.seek.find():
                user = await self.users.get(doc["user"])
                if user is not None:
                    seek = Seek(
                        doc["_id"],
                        user,
                        doc["variant"],
                        fen=doc["fen"],
                        color=doc["color"],
                        day=doc["day"],
                        rated=doc["rated"],
                        rrmin=doc.get("rrmin"),
                        rrmax=doc.get("rrmax"),
                        chess960=doc["chess960"],
                        player1=user,
                        expire_at=doc.get("expireAt"),
                    )
                    log.debug("Loading seek from database: %s" % seek)
                    self.seeks[seek.id] = seek
                    user.seeks[seek.id] = seek

            # Read games in play and start their clocks
            cursor = self.db.game.find({"r": "d", "$or": [{"s": -2}, {"s": -1}]})
            cursor.sort("d", -1)
            today = datetime.now(timezone.utc)

            async for doc in cursor:
                corr = doc.get("c", False)

                if corr:
                    # Don't load old never started corr games
                    if doc["s"] == -2 and doc["d"] < today - timedelta(days=doc["b"]):
                        continue
                else:
                    # Don't load old uninished games
                    if doc["d"] < today - timedelta(days=1):
                        continue

                if doc["s"] < ABORTED:
                    game_id = doc["_id"]
                    try:
                        game = await load_game(self, game_id)
                        if game is None:
                            continue
                        self.games[game_id] = game
                        if corr:
                            game.wplayer.correspondence_games.append(game)
                            game.bplayer.correspondence_games.append(game)
                            game.stopwatch.restart(from_db=True)
                        else:
                            try:
                                game.stopwatch.restart()
                            except AttributeError:
                                game.gameClocks.restart("a")
                                game.gameClocks.restart("b")
                    except NotInDbUsers:
                        log.error("Failed toload game %s", game_id)

                    if game.bot_game:
                        if len(game.board.move_stack) > 0 and len(game.steps) == 1:
                            game.create_steps()
                        bot_player = game.wplayer if game.wplayer.bot else game.bplayer
                        bot_player.game_queues[game_id] = asyncio.Queue()
                        await bot_player.event_queue.put(game.game_start)
                        await bot_player.game_queues[game_id].put(game.game_state)

                    if game.board.ply > 0:
                        self.g_cnt[0] += 1

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
            log.error("init_from_db() Exception")
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
                log.error("PoSyntaxError in %s", poname)

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
                    or variant in NEW_MONTHLY_VARIANTS
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
        asyncio.create_task(BOT_task(ai, self), name="BOT-RM")
        asyncio.create_task(BOT_task(rm, self), name="BOT-FSF")

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
            asyncio.create_task(bot.start(DISCORD_TOKEN), name="Discord-BOT")

    def __init_twitch(self) -> Twitch:
        result = Twitch(self.app)
        if not DEV:
            asyncio.create_task(result.init_subscriptions(), name="Twitch-subscriptions")
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

    async def remove_from_cache(self, game):
        await asyncio.sleep(GAME_KEEP_TIME)

        if game.id == self.tv:
            self.tv = None

        if game.id in self.games:
            del self.games[game.id]

        if game.bot_game:
            try:
                for player in game.all_players:
                    if player.bot:
                        del player.game_queues[game.id]
            except KeyError:
                log.error("Failed to del %s from game_queues", game.id)

        log.debug("Removed %s OK", game.id)

    async def server_shutdown(self):
        self.shutdown = True

        log.debug("\nServer shutdown activated\n")

        # notify users
        msg = "Server will restart in about 30 seconds. Sorry for the inconvenience!"
        response = {"type": "roundchat", "user": "", "message": msg, "room": "player"}
        for game in [game for game in self.games.values() if not game.corr]:
            await round_broadcast(game, response, full=True)

        # save correspondence and regular seeks to database
        corr_seeks = [seek.corr_json for seek in self.seeks.values() if seek.day > 0]
        reg_seeks = [
            seek.seek_json for seek in self.seeks.values() if seek.day == 0 and seek.creator.online
        ]
        await self.db.seek.delete_many({})
        if len(corr_seeks) > 0:
            for seek in corr_seeks:
                log.debug("saving correspondence seek to database: %s" % seek)
            await self.db.seek.insert_many(corr_seeks)
        if len(reg_seeks) > 0:
            for seek in reg_seeks:
                log.debug("saving regular seek to database: %s" % seek)
            await self.db.seek.insert_many(reg_seeks)

        # save auto pairings
        await self.db.autopairing.delete_many({})
        auto_pairings = [
            {
                "variant_tc": variant_tc,
                "users": [
                    (user.username, self.auto_pairing_users[user])
                    for user in self.auto_pairings[variant_tc]
                ],
            }
            for variant_tc in self.auto_pairings
        ]
        if len(auto_pairings) > 0:
            await self.db.autopairing.insert_many(auto_pairings)

        # terminate BOT users
        for user in [user for user in self.users.values() if user.bot]:
            await user.event_queue.put('{"type": "terminated"}')

        # close game_sockets
        for user in [user for user in self.users.values() if not user.bot]:
            await user.close_all_game_sockets()

        # close lobbysockets
        await self.lobby.close_lobby_sockets()

        # close tourneysockets
        for tid in self.tourneysockets:
            for username in list(self.tourneysockets[tid].keys()):
                ts_dict = self.users[username].tournament_sockets
                if tid in ts_dict:
                    ws_set = ts_dict[tid]
                    for ws in list(ws_set):
                        await ws.close()

    def online_count(self):
        return sum((1 for user in self.users.values() if user.online))

    def auto_pairing_count(self):
        return sum((1 for user in self.auto_pairing_users if user.ready_for_auto_pairing))

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
