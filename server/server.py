import argparse
import asyncio
import collections
import logging
import os
from operator import neg

import jinja2
from aiohttp import web
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup
from motor import motor_asyncio as ma
from sortedcollections import ValueSortedDict

from ai import BOT_task
from const import VARIANTS, STARTED
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from glicko2.glicko2 import DEFAULT_PERF
from routes import get_routes, post_routes
from settings import MAX_AGE, SECRET_KEY, MONGO_HOST, MONGO_DB_NAME, FISHNET_KEYS
from seek import Seek
from user import User

log = logging.getLogger(__name__)


def make_app(with_db=True):
    app = web.Application()
    setup(app, EncryptedCookieStorage(SECRET_KEY, max_age=MAX_AGE))

    if with_db:
        app.on_startup.append(init_db)

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_cleanup.append(cleanup)

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1])
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static")

    return app


async def init_db(app):
    app["client"] = ma.AsyncIOMotorClient(MONGO_HOST)
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
    app["users"]["Random-Mover"].bot_online = True
    app["websockets"] = {}
    app["seeks"] = {}
    app["games"] = {}
    app["chat"] = collections.deque([], 200)
    app["channels"] = set()
    app["highscore"] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
    app["crosstable"] = {}

    # counters for games and users
    app["g_cnt"] = 0
    app["u_cnt"] = 0

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
        seek = Seek(rm, variant_name, base=5, inc=3, level=0, chess960=variant960)
        app["seeks"][seek.id] = seek
        rm.seeks[seek.id] = seek

    ai = app["users"]["Fairy-Stockfish"]
    loop = asyncio.get_event_loop()

    loop.create_task(BOT_task(ai, app))
    loop.create_task(BOT_task(rm, app))

    # Configure templating.
    app["jinja"] = jinja2.Environment(
        loader=jinja2.FileSystemLoader("templates"),
        autoescape=jinja2.select_autoescape(["html"]))

    if app["db"] is None:
        return

    # Read users and highscore from db
    try:
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
                    first_name=doc.get("first_name"),
                    last_name=doc.get("last_name"),
                    country=doc.get("country"),
                    bot=doc.get("title") == "BOT",
                    perfs=perfs,
                    enabled=doc.get("enabled", True)
                )

        db_collections = await app["db"].list_collection_names()

        if "highscore" not in db_collections:
            await generate_highscore(app["db"])
        cursor = app["db"].highscore.find()
        async for doc in cursor:
            app["highscore"][doc["_id"]] = ValueSortedDict(neg, doc["scores"])

        if "crosstable" not in db_collections:
            await generate_crosstable(app["db"])
        cursor = app["db"].crosstable.find()
        async for doc in cursor:
            app["crosstable"][doc["_id"]] = doc

    except Exception:
        print("Maybe mongodb is not running...")
        raise


async def shutdown(app):
    app["data"]["kill"] = True


async def cleanup(app):
    # notify users
    msg = "Server update started. Sorry for the inconvenience!"
    response = {"type": "shutdown", "message": msg}
    for user in app["users"].values():
        if user.username in app["websockets"]:
            ws = app["websockets"][user.username]
            try:
                await ws.send_json(response)
            except Exception:
                pass
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

    # close websockets
    for user in app["users"].values():
        if not user.bot:
            for ws in user.game_sockets.values():
                try:
                    await ws.close()
                except Exception:
                    pass

    for ws in app['websockets'].values():
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
