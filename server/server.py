import asyncio
import uvloop

import argparse
import gettext
import collections
import logging
import os
from operator import neg
from urllib.parse import urlparse

import jinja2
from aiohttp import web
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup
from motor import motor_asyncio as ma
from sortedcollections import ValueSortedDict
from pythongettext.msgfmt import Msgfmt
from pythongettext.msgfmt import PoSyntaxError

from ai import BOT_task
from broadcast import lobby_broadcast, round_broadcast
from const import VARIANTS, STARTED, LANGUAGES, T_CREATED, T_STARTED
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from glicko2.glicko2 import DEFAULT_PERF
from routes import get_routes, post_routes
from settings import MAX_AGE, SECRET_KEY, MONGO_HOST, MONGO_DB_NAME, FISHNET_KEYS, URI, static_url
from seek import Seek
from user import User
from tournaments import load_tournament

log = logging.getLogger(__name__)

asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())


async def on_prepare(request, response):
    if request.path.endswith(".br"):
        # brotli compressed js
        response.headers["Content-Encoding"] = "br"
        return
    elif request.path.startswith("/variant") or request.path.startswith("/news"):
        # Learn and News pages may have links to other sites
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return
    else:
        # required to get stockfish.wasm in Firefox
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"


def make_app(with_db=True):
    app = web.Application()
    parts = urlparse(URI)
    setup(app, EncryptedCookieStorage(SECRET_KEY, max_age=MAX_AGE, secure=parts.scheme == "https"))

    if with_db:
        app.on_startup.append(init_db)

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_response_prepare.append(on_prepare)

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1])
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static", append_version=True)

    return app


async def init_db(app):
    app["client"] = ma.AsyncIOMotorClient(MONGO_HOST, tz_aware=True,)
    app["db"] = app["client"][MONGO_DB_NAME]


async def init_state(app):
    # We have to put "kill" into a dict to prevent getting:
    # DeprecationWarning: Changing state of started or joined application is deprecated
    app["data"] = {"kill": False}

    if "db" not in app:
        app["db"] = None

    app["users"] = {
        "Random-Mover": User(app, bot=True, username="Random-Mover"),
        "Fairy-Stockfish": User(app, bot=True, username="Fairy-Stockfish"),
        "Discord-Relay": User(app, anon=True, username="Discord-Relay"),
    }
    app["users"]["Random-Mover"].online = True
    app["lobbysockets"] = {}  # one dict only! {user.username: user.tournament_sockets, ...}
    app["lobbychat"] = collections.deque([], 100)

    app["tourneysockets"] = {}  # one dict per tournament! {tournamentId: {user.username: user.tournament_sockets, ...}, ...}
    app["tournaments"] = {}
    app["tourneychat"] = {}  # one deque per tournament! {tournamentId: collections.deque([], 100), ...}

    app["seeks"] = {}
    app["games"] = {}
    app["invites"] = {}
    app["game_channels"] = set()
    app["invite_channels"] = set()
    app["highscore"] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
    app["crosstable"] = {}
    app["stats"] = {}

    # counters for games
    app["g_cnt"] = [0]

    # last game played
    app["tv"] = None

    # fishnet active workers
    app["workers"] = set()
    # fishnet works
    app["works"] = {}
    # fishnet worker tasks
    app["fishnet"] = asyncio.PriorityQueue()
    # fishnet workers monitor
    app["fishnet_monitor"] = {}
    app["fishnet_versions"] = {}
    for key in FISHNET_KEYS:
        app["fishnet_monitor"][FISHNET_KEYS[key]] = collections.deque([], 50)

    rm = app["users"]["Random-Mover"]
    for variant in VARIANTS:
        variant960 = variant.endswith("960")
        variant_name = variant[:-3] if variant960 else variant
        byoyomi = variant.endswith("shogi") or variant in ("dobutsu", "gorogoro", "janggi", "shogun")
        seek = Seek(rm, variant_name, base=5, inc=30 if byoyomi else 3, level=0, chess960=variant960, byoyomi_period=1 if byoyomi else 0)
        app["seeks"][seek.id] = seek
        rm.seeks[seek.id] = seek

    ai = app["users"]["Fairy-Stockfish"]

    asyncio.create_task(BOT_task(ai, app))
    asyncio.create_task(BOT_task(rm, app))

    # Configure templating.
    app["jinja"] = {}
    base = os.path.dirname(__file__)
    for lang in LANGUAGES:
        # Generate compiled mo file
        folder = os.path.join(base, "../lang/", lang, "LC_MESSAGES")
        poname = os.path.join(folder, "server.po")
        moname = os.path.join(folder, "server.mo")
        try:
            with open(poname, 'rb') as po_file:
                po_lines = [line for line in po_file if line[:8] != b"#, fuzzy"]
                mo = Msgfmt(po_lines).get()
                with open(moname, 'wb') as mo_file:
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
            extensions=['jinja2.ext.i18n'],
            loader=jinja2.FileSystemLoader("templates"),
            autoescape=jinja2.select_autoescape(["html"]))
        env.install_gettext_translations(translation, newstyle=True)
        env.globals["static"] = static_url

        app["jinja"][lang] = env

    if app["db"] is None:
        return

    # Read tournaments, users and highscore from db
    try:
        cursor = app["db"].tournament.find()
        cursor.sort('startsAt', -1)
        counter = 0
        async for doc in cursor:
            if doc["status"] in (T_CREATED, T_STARTED):
                await load_tournament(app, doc["_id"])
                counter += 1
                if counter > 3:
                    break

        cursor = app["db"].user.find()
        async for doc in cursor:
            if doc["_id"] not in app["users"]:
                perfs = doc.get("perfs")
                if perfs is None:
                    perfs = {variant: DEFAULT_PERF for variant in VARIANTS}

                app["users"][doc["_id"]] = User(
                    app,
                    username=doc["_id"],
                    title=doc.get("title"),
                    bot=doc.get("title") == "BOT",
                    perfs=perfs,
                    enabled=doc.get("enabled", True)
                )

        db_collections = await app["db"].list_collection_names()

        # if "highscore" not in db_collections:
        # Always create new highscore lists on server start
        await generate_highscore(app["db"])
        cursor = app["db"].highscore.find()
        async for doc in cursor:
            app["highscore"][doc["_id"]] = ValueSortedDict(neg, doc["scores"])

        if "crosstable" not in db_collections:
            await generate_crosstable(app["db"])
        cursor = app["db"].crosstable.find()
        async for doc in cursor:
            app["crosstable"][doc["_id"]] = doc

        await app["db"].game.create_index("us")
        await app["db"].game.create_index("v")
        await app["db"].game.create_index("y")
        await app["db"].game.create_index("by")

    except Exception:
        print("Maybe mongodb is not running...")
        raise

    # create test tournament
    if 0:
        pass
        # from first_janggi_tournament import add_games
        # await add_games(app)

        # from test_tournament import create_arena_test
        # await create_arena_test(app)

        # from test_tournament import create_dev_arena_tournament
        # await create_dev_arena_tournament(app)


async def shutdown(app):
    app["data"]["kill"] = True

    # notify users
    msg = "Server will restart in about 30 seconds. Sorry for the inconvenience!"
    response = {"type": "lobbychat", "user": "", "message": msg}
    await lobby_broadcast(app["lobbysockets"], response)

    response = {"type": "roundchat", "user": "", "message": msg, "room": "player"}
    for game in app["games"].values():
        await round_broadcast(game, app["users"], response, full=True)

    # No need to wait in unit tests
    if app["db"] is not None:
        print('......WAIT 25')
        await asyncio.sleep(25)

    for user in app["users"].values():
        if user.bot:
            await user.event_queue.put('{"type": "terminated"}')

    # abort games
    for game in app["games"].values():
        for player in (game.wplayer, game.bplayer):
            if game.status <= STARTED:
                response = await game.abort()
                if not player.bot and game.id in player.game_sockets:
                    ws = player.game_sockets[game.id]
                    try:
                        await ws.send_json(response)
                    except Exception:
                        print("Failed to send game %s abort to %s" % (game.id, player.username))

    # close lobbysockets
    for user in app["users"].values():
        if not user.bot:
            for ws in list(user.game_sockets.values()):
                try:
                    await ws.close()
                except Exception:
                    pass

    for ws_set in app['lobbysockets'].values():
        for ws in list(ws_set):
            await ws.close()

    if "client" in app:
        app["client"].close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='PyChess chess variants server')
    parser.add_argument('-v', action='store_true', help='Verbose output. Changes log level from INFO to DEBUG.')
    parser.add_argument('-w', action='store_true', help='Less verbose output. Changes log level from INFO to WARNING.')
    args = parser.parse_args()

    logging.basicConfig()
    logging.getLogger().setLevel(level=logging.DEBUG if args.v else logging.WARNING if args.w else logging.INFO)

    app = make_app()

    web.run_app(app, port=os.environ.get("PORT", 8080))
