import argparse
import asyncio
import logging
import os

import jinja2
import aiomonitor
from aiohttp import web
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup

from routes import get_routes, post_routes
from settings import SECRET_KEY
from utils import User


async def make_app(loop):
    app = web.Application(loop=loop)
    setup(app, EncryptedCookieStorage(SECRET_KEY))
    app["users"] = {"Random-Mover": User(bot=True, username="Random-Mover")}
    app["websockets"] = {}
    app["seeks"] = {}
    app["games"] = {}

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
            response = game.abort()
            if not player.bot:
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
