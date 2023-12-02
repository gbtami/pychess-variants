import asyncio

import argparse
import gettext
import collections
import logging
import os
from operator import neg
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from sys import platform

if platform not in ("win32", "darwin"):
    import uvloop
else:
    print("uvloop not installed")

import jinja2
from aiohttp import web
from aiohttp.log import access_logger
from aiohttp.web_app import Application
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup
from aiohttp_remotes import Secure
from motor.motor_asyncio import AsyncIOMotorClient
from sortedcollections import ValueSortedDict
from pythongettext.msgfmt import Msgfmt
from pythongettext.msgfmt import PoSyntaxError

from typedefs import (
    db_key,
    client_key,
    crosstable_key,
    daily_puzzle_ids_key,
    date_key,
    discord_key,
    fishnet_queue_key,
    fishnet_monitor_key,
    fishnet_versions_key,
    fishnet_works_key,
    game_channels_key,
    games_key,
    g_cnt_key,
    gettext_key,
    highscore_key,
    invites_key,
    invite_channels_key,
    jinja_key,
    kill_key,
    lobbychat_key,
    lobbysockets_key,
    users_key,
    shield_key,
    shield_owners_key,
    seeks_key,
    sent_lichess_team_msg_key,
    stats_key,
    stats_humans_key,
    tournaments_key,
    tourneychat_key,
    tourneynames_key,
    tourneysockets_key,
    tv_key,
    twitch_key,
    youtube_key,
    workers_key,
)
from ai import BOT_task
from broadcast import lobby_broadcast, round_broadcast
from const import (
    CORR_SEEK_EXPIRE_SECS,
    NOTIFY_EXPIRE_SECS,
    VARIANTS,
    STARTED,
    ABORTED,
    LANGUAGES,
    T_CREATED,
    T_STARTED,
    MAX_CHAT_LINES,
    SCHEDULE_MAX_DAYS,
    ARENA,
    WEEKLY,
    MONTHLY,
    SHIELD,
)
from discord_bot import DiscordBot, FakeDiscordBot
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from generate_shield import generate_shield
from glicko2.glicko2 import DEFAULT_PERF
from routes import get_routes, post_routes
from seek import Seek
from settings import (
    DEV,
    DISCORD_TOKEN,
    MAX_AGE,
    SECRET_KEY,
    MONGO_HOST,
    MONGO_DB_NAME,
    FISHNET_KEYS,
    URI,
    static_url,
    STATIC_ROOT,
    BR_EXTENSION,
    SOURCE_VERSION,
)
from user import User
from utils import load_game
from tournaments import load_tournament, get_scheduled_tournaments, translated_tournament_name
from twitch import Twitch
from youtube import Youtube
from scheduler import (
    create_scheduled_tournaments,
    new_scheduled_tournaments,
    MONTHLY_VARIANTS,
    WEEKLY_VARIANTS,
    PAUSED_MONTHLY_VARIANTS,
    SEATURDAY,
    SHIELDS,
)
from videos import VIDEOS

log = logging.getLogger(__name__)

if platform not in ("win32", "darwin"):
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())


@web.middleware
async def handle_404(request, handler):
    try:
        return await handler(request)
    except web.HTTPException as ex:
        if ex.status == 404:
            template = request.app[jinja_key]["en"].get_template("404.html")
            text = await template.render_async(
                {
                    "dev": DEV,
                    "home": URI,
                    "view_css": "404.css",
                    "asseturl": STATIC_ROOT,
                    "js": "/static/pychess-variants.js%s%s" % (BR_EXTENSION, SOURCE_VERSION),
                }
            )
            return web.Response(text=text, content_type="text/html")
        else:
            raise


async def on_prepare(request, response):
    if request.path.endswith(".br"):
        # brotli compressed js
        response.headers["Content-Encoding"] = "br"
        return
    elif (
        request.path.startswith("/variants")
        or request.path.startswith("/news")
        or request.path.startswith("/video")
    ):
        # Learn and News pages may have links to other sites
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return
    else:
        # required to get stockfish.wasm in Firefox
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"

        if request.match_info.get("gameId") is not None:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Expires"] = "0"


def make_app(db_client=None) -> Application:
    app = web.Application()
    if False:  # URI.startswith("https"):
        secure = Secure()  # redirect_url=URI)
        app.on_response_prepare.append(secure.on_response_prepare)
        app.middlewares.append(secure.middleware)

    parts = urlparse(URI)
    setup(
        app,
        EncryptedCookieStorage(SECRET_KEY, max_age=MAX_AGE, secure=parts.scheme == "https"),
    )

    if db_client is not None:
        app[client_key] = db_client
        app[db_key] = app[client_key][MONGO_DB_NAME]

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_response_prepare.append(on_prepare)

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1])
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static", append_version=True)
    app.middlewares.append(handle_404)

    return app


async def init_state(app):
    # We have to put "kill" into a dict to prevent getting:
    # DeprecationWarning: Changing state of started or joined application is deprecated
    app[kill_key] = {"kill": False}
    app[date_key] = {"startedAt": datetime.now(timezone.utc)}

    if db_key not in app:
        app[db_key] = None

    app[users_key] = {
        "PyChess": User(app, bot=True, username="PyChess"),
        "Random-Mover": User(app, bot=True, username="Random-Mover"),
        "Fairy-Stockfish": User(app, bot=True, username="Fairy-Stockfish"),
        "Discord-Relay": User(app, anon=True, username="Discord-Relay"),
    }
    app[users_key]["Random-Mover"].online = True
    app[lobbysockets_key] = {}  # one dict only! {user.username: user.tournament_sockets, ...}
    app[lobbychat_key] = collections.deque([], MAX_CHAT_LINES)

    # one dict per tournament! {tournamentId: {user.username: user.tournament_sockets, ...}, ...}
    app[tourneysockets_key] = {}

    # translated scheduled tournament names {(variant, frequency, t_type): tournament.name, ...}
    app[tourneynames_key] = {lang: {} for lang in LANGUAGES}

    app[tournaments_key] = {}

    # lichess allows 7 team message per week, so we will send one (comulative) per day only
    # TODO: save/restore from db
    app[sent_lichess_team_msg_key] = []

    # one deque per tournament! {tournamentId: collections.deque([], MAX_CHAT_LINES), ...}
    app[tourneychat_key] = {}

    app[seeks_key] = {}
    app[games_key] = {}
    app[invites_key] = {}
    app[game_channels_key] = set()
    app[invite_channels_key] = set()
    app[highscore_key] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
    app[crosstable_key] = {}
    app[shield_key] = {}
    app[shield_owners_key] = {}  # {variant: username, ...}
    app[daily_puzzle_ids_key] = {}  # {date: puzzle._id, ...}

    # TODO: save/restore monthly stats from db when current month is over
    app[stats_key] = {}
    app[stats_humans_key] = {}

    # counters for games
    app[g_cnt_key] = [0]

    # last game played
    app[tv_key] = None

    app[twitch_key] = Twitch(app)
    if not DEV:
        asyncio.create_task(app[twitch_key].init_subscriptions())

    app[youtube_key] = Youtube(app)

    # fishnet active workers
    app[workers_key] = set()
    # fishnet works
    app[fishnet_works_key] = {}
    # fishnet worker tasks
    app[fishnet_queue_key] = asyncio.PriorityQueue()
    # fishnet workers monitor
    app[fishnet_monitor_key] = {}
    app[fishnet_versions_key] = {}
    for key in FISHNET_KEYS:
        app[fishnet_monitor_key][FISHNET_KEYS[key]] = collections.deque([], 50)

    rm = app[users_key]["Random-Mover"]
    ai = app[users_key]["Fairy-Stockfish"]

    asyncio.create_task(BOT_task(ai, app))
    asyncio.create_task(BOT_task(rm, app))

    # Configure translations and templating.
    app[gettext_key] = {}
    app[jinja_key] = {}
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

        app[jinja_key][lang] = env
        app[gettext_key][lang] = translation

        translation.install()

        for variant in VARIANTS:
            if (
                variant in MONTHLY_VARIANTS
                or variant in SEATURDAY
                or variant in PAUSED_MONTHLY_VARIANTS
            ):
                tname = translated_tournament_name(variant, MONTHLY, ARENA, translation)
                app[tourneynames_key][lang][(variant, MONTHLY, ARENA)] = tname
            if variant in SEATURDAY or variant in WEEKLY_VARIANTS:
                tname = translated_tournament_name(variant, WEEKLY, ARENA, translation)
                app[tourneynames_key][lang][(variant, WEEKLY, ARENA)] = tname
            if variant in SHIELDS:
                tname = translated_tournament_name(variant, SHIELD, ARENA, translation)
                app[tourneynames_key][lang][(variant, SHIELD, ARENA)] = tname

    if app[db_key] is None:
        app[discord_key] = FakeDiscordBot()
        return

    # create Discord bot
    if DEV:
        app[discord_key] = FakeDiscordBot()
    else:
        bot = DiscordBot(app)
        app[discord_key] = bot
        asyncio.create_task(bot.start(DISCORD_TOKEN))

    # Read tournaments, users and highscore from db
    try:
        cursor = app[db_key].user.find()
        async for doc in cursor:
            if doc["_id"] not in app[users_key]:
                perfs = doc.get("perfs", {variant: DEFAULT_PERF for variant in VARIANTS})
                pperfs = doc.get("pperfs", {variant: DEFAULT_PERF for variant in VARIANTS})

                app[users_key][doc["_id"]] = User(
                    app,
                    username=doc["_id"],
                    title=doc.get("title"),
                    bot=doc.get("title") == "BOT",
                    perfs=perfs,
                    pperfs=pperfs,
                    enabled=doc.get("enabled", True),
                    lang=doc.get("lang", "en"),
                    theme=doc.get("theme", "dark"),
                )

        await app[db_key].tournament.create_index("startsAt")
        await app[db_key].tournament.create_index("status")

        cursor = app[db_key].tournament.find(
            {"$or": [{"status": T_STARTED}, {"status": T_CREATED}]}
        )
        cursor.sort("startsAt", -1)
        to_date = (datetime.now() + timedelta(days=SCHEDULE_MAX_DAYS)).date()
        async for doc in cursor:
            if doc["status"] == T_STARTED or (
                doc["status"] == T_CREATED and doc["startsAt"].date() <= to_date
            ):
                await load_tournament(app, doc["_id"])

        already_scheduled = await get_scheduled_tournaments(app)
        new_tournaments_data = new_scheduled_tournaments(already_scheduled)
        await create_scheduled_tournaments(app, new_tournaments_data)

        asyncio.create_task(generate_shield(app))

        db_collections = await app[db_key].list_collection_names()

        # if "highscore" not in db_collections:
        # Always create new highscore lists on server start
        hs = await generate_highscore(app[db_key])
        for doc in hs:
            app[highscore_key][doc["_id"]] = ValueSortedDict(neg, doc["scores"])

        if "crosstable" not in db_collections:
            await generate_crosstable(app[db_key])
        cursor = app[db_key].crosstable.find()
        async for doc in cursor:
            app[crosstable_key][doc["_id"]] = doc

        if "dailypuzzle" not in db_collections:
            try:
                await app[db_key].create_collection("dailypuzzle", capped=True, size=50000, max=365)
            except NotImplementedError:
                await app[db_key].create_collection("dailypuzzle")
        else:
            cursor = app[db_key].dailypuzzle.find()
            docs = await cursor.to_list(length=365)
            app[daily_puzzle_ids_key] = {doc["_id"]: doc["puzzleId"] for doc in docs}

        await app[db_key].game.create_index("us")
        await app[db_key].game.create_index("r")
        await app[db_key].game.create_index("v")
        await app[db_key].game.create_index("y")
        await app[db_key].game.create_index("by")
        await app[db_key].game.create_index("c")

        if "notify" not in db_collections:
            await app[db_key].create_collection("notify")
        await app[db_key].notify.create_index("notifies")
        await app[db_key].notify.create_index("createdAt", expireAfterSeconds=NOTIFY_EXPIRE_SECS)

        if "seek" not in db_collections:
            await app[db_key].create_collection("seek")
        await app[db_key].seek.create_index("createdAt", expireAfterSeconds=CORR_SEEK_EXPIRE_SECS)

        # Read correspondence seeks
        async for doc in app[db_key].seek.find():
            user = app[users_key].get(doc["user"])
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
                    created_at=doc["createdAt"],
                )
                app[seeks_key][seek.id] = seek
                user.seeks[seek.id] = seek

        # Read correspondence games in play and start their clocks
        cursor = app[db_key].game.find({"r": "d", "c": True})
        async for doc in cursor:
            if doc["s"] < ABORTED:
                game = await load_game(app, doc["_id"])
                app[games_key][doc["_id"]] = game
                game.wplayer.correspondence_games.append(game)
                game.bplayer.correspondence_games.append(game)
                game.stopwatch.restart(from_db=True)

        if "video" not in db_collections:
            if DEV:
                await app[db_key].video.drop()
            await app[db_key].video.insert_many(VIDEOS)

    except Exception:
        print("Maybe mongodb is not running...")
        raise

    # create test tournament
    if 1:
        pass
        # from test_tournament import create_arena_test
        # await create_arena_test(app)

        # from test_tournament import create_dev_arena_tournament
        # await create_dev_arena_tournament(app)


async def shutdown(app):
    app[kill_key]["kill"] = True

    # notify users
    msg = "Server will restart in about 30 seconds. Sorry for the inconvenience!"
    response = {"type": "lobbychat", "user": "", "message": msg}
    await lobby_broadcast(app[lobbysockets_key], response)

    response = {"type": "roundchat", "user": "", "message": msg, "room": "player"}
    for game in list(app[games_key].values()):
        await round_broadcast(game, response, full=True)

    # No need to wait in dev mode and in unit tests
    if not DEV and app[db_key] is not None:
        print("......WAIT 20")
        await asyncio.sleep(20)

    # save corr seeks
    corr_seeks = [seek.corr_json for seek in app[seeks_key].values() if seek.day > 0]
    if len(corr_seeks) > 0:
        await app[db_key].seek.delete_many({})
        await app[db_key].seek.insert_many(corr_seeks)

    for user in list(app[users_key].values()):
        if user.bot:
            await user.event_queue.put('{"type": "terminated"}')

    # abort games
    for game in list(app[games_key].values()):
        if game.status <= STARTED and (not game.corr):
            response = await game.abort_by_server()
            for player in (game.wplayer, game.bplayer):
                if not player.bot and game.id in player.game_sockets:
                    ws = player.game_sockets[game.id]
                    try:
                        await ws.send_json(response)
                    except Exception:
                        print("Failed to send game %s abort to %s" % (game.id, player.username))

    # close lobbysockets
    for user in list(app[users_key].values()):
        if not user.bot:
            for ws in list(user.game_sockets.values()):
                try:
                    await ws.close()
                except Exception:
                    pass

    for ws_set in list(app[lobbysockets_key].values()):
        for ws in list(ws_set):
            await ws.close()

    if client_key in app:
        app[client_key].close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PyChess chess variants server")
    parser.add_argument(
        "-v",
        action="store_true",
        help="Verbose output. Changes log level from INFO to DEBUG.",
    )
    parser.add_argument(
        "-w",
        action="store_true",
        help="Less verbose output. Changes log level from INFO to WARNING.",
    )
    args = parser.parse_args()

    logging.basicConfig()
    logging.getLogger().setLevel(
        level=logging.DEBUG if args.v else logging.WARNING if args.w else logging.INFO
    )

    app = make_app(db_client=AsyncIOMotorClient(MONGO_HOST, tz_aware=True))

    web.run_app(
        app, access_log=None if args.w else access_logger, port=int(os.environ.get("PORT", 8080))
    )
