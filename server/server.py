import argparse
import asyncio
import collections
import logging
import os
import weakref
from operator import neg

import jinja2
import aiomonitor
from aiohttp import web
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup
from motor import motor_asyncio as ma
from sortedcollections import ValueSortedDict

from ai import AI_task
from const import VARIANTS, STARTED
from generate_crosstable import generate_crosstable
from generate_highscore import generate_highscore
from glicko2.glicko2 import DEFAULT_PERF
from routes import get_routes, post_routes
from settings import SECRET_KEY, MONGO_HOST, MONGO_DB_NAME, FISHNET_KEYS
from seek import Seek
from user import User


async def make_app(loop):
    app = web.Application(loop=loop)
    setup(app, EncryptedCookieStorage(SECRET_KEY))

    app["client"] = ma.AsyncIOMotorClient(MONGO_HOST)
    app["db"] = app["client"][MONGO_DB_NAME]

    app["users"] = {
        "Random-Mover": User(db=app["db"], bot=True, username="Random-Mover"),
        "Fairy-Stockfish": User(db=app["db"], bot=True, username="Fairy-Stockfish"),
        "Discord-Relay": User(db=app["db"], anon=True, username="Discord-Relay"),
    }
    app["users"]["Random-Mover"].bot_online = True
    app["websockets"] = {}
    app["seeks"] = {}
    app["games"] = {}
    app["tasks"] = weakref.WeakSet()
    app["chat"] = collections.deque([], 200)
    app["channels"] = set()
    app["highscore"] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
    app["crosstable"] = {}

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

    bot = app["users"]["Random-Mover"]
    for variant in VARIANTS:
        variant960 = variant.endswith("960")
        variant_name = variant[:-3] if variant960 else variant
        seek = Seek(bot, variant_name, base=5, inc=3, level=0, chess960=variant960)
        app["seeks"][seek.id] = seek
        bot.seeks[seek.id] = seek

    ai = app["users"]["Fairy-Stockfish"]
    app["tasks"].add(loop.create_task(AI_task(ai, app)))

    # Read users and highscore from db
    cursor = app["db"].user.find()
    try:
        async for doc in cursor:
            if doc["_id"] not in app["users"]:
                perfs = doc.get("perfs")
                if perfs is None:
                    perfs = {variant: DEFAULT_PERF for variant in VARIANTS}

                app["users"][doc["_id"]] = User(
                    db=app["db"],
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

    app.on_shutdown.append(shutdown)

    # Configure templating.
    app["jinja"] = jinja2.Environment(
        loader=jinja2.FileSystemLoader("templates"),
        autoescape=jinja2.select_autoescape(["html"]))

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1])
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static")

    return app


async def shutdown(app):
    # notify users
    msg = "Server update started. Sorry for the inconvenience!"
    response = {"type": "shutdown", "message": msg}
    for user in app["users"].values():
        if user.username in app["websockets"]:
            ws = app["websockets"][user.username]
            await ws.send_json(response)
        if user.bot:
            await user.event_queue.put({"type": "terminated"})

    # delete seeks
    app["seeks"] = {}

    # abort games
    for game in app["games"].values():
        for player in (game.wplayer, game.bplayer):
            if game.status <= STARTED:
                response = await game.abort()
                if not player.bot and game.id in player.game_sockets:
                    ws = player.game_sockets[game.id]
                    await ws.send_json(response)
    app["games"] = {}

    # close websockets
    for user in app["users"].values():
        if not user.bot:
            for ws in user.game_sockets.values():
                await ws.close()

    for ws in app['websockets'].values():
        await ws.close()
    app['websockets'].clear()

    app["client"].close()

    for task in set(app["tasks"]):
        task.cancel()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='PyChess chess variants server')
    parser.add_argument('-v', action='store_true', help='Verbose output. Changes log level from INFO to DEBUG.')
    parser.add_argument('-w', action='store_true', help='Less verbose output. Changes log level from INFO to WARNING.')
    args = parser.parse_args()

    logging.basicConfig()
    logging.getLogger().setLevel(level=logging.DEBUG if args.v else logging.WARNING if args.w else logging.INFO)

    loop = asyncio.get_event_loop()
    app = loop.run_until_complete(make_app(loop))

    with aiomonitor.start_monitor(loop=loop, locals={"app": app}):
        web.run_app(app, port=os.environ.get("PORT", 8080))
