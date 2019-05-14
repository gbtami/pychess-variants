import argparse
import logging
import os

import jinja2
from aiohttp import web
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup

from routes import get_routes, post_routes
from settings import SECRET_KEY


def make_app():
    app = web.Application()
    setup(app, EncryptedCookieStorage(SECRET_KEY))
    app["users"] = {}
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
    for user in app["users"].values():
        if not user.is_bot:
            for ws in user.game_sockets.values():
                await ws.close()
            user.game_sockets.clear()

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

    app = make_app()
    web.run_app(app, port=os.environ.get("PORT", 8080))
