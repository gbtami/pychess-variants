from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import traceback
from urllib.parse import urlparse

if sys.platform not in ("win32", "darwin"):
    import uvloop
else:
    print("uvloop not installed")

from aiohttp import web
from aiohttp.log import access_logger
from aiohttp.web_app import Application
from aiohttp_session import SimpleCookieStorage
from aiohttp_session.cookie_storage import EncryptedCookieStorage
from aiohttp_session import setup
import aiohttp_session
import aiomonitor

from motor.motor_asyncio import AsyncIOMotorClient

from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state

from typedefs import (
    client_key,
    pychess_global_app_state_key,
    db_key,
)
from routes import get_routes, post_routes
from settings import (
    DEV,
    MAX_AGE,
    SECRET_KEY,
    MONGO_HOST,
    MONGO_DB_NAME,
    URI,
    STATIC_ROOT,
    BR_EXTENSION,
    SOURCE_VERSION,
)
from users import NotInDbUsers
from logger import log

if sys.platform not in ("win32", "darwin"):
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())


def log_uncaught_exceptions(ex_cls, ex, tb):
    log.critical(''.join(traceback.format_tb(tb)))
    log.critical('{0}: {1}'.format(ex_cls, ex))


sys.excepthook = log_uncaught_exceptions


@web.middleware
async def handle_404(request, handler):
    app_state = get_app_state(request.app)
    try:
        return await handler(request)
    except web.HTTPException as ex:
        if ex.status == 404:
            theme = "dark"
            session = await aiohttp_session.get_session(request)
            session_user = session.get("user_name")
            if session_user is not None:
                user = await app_state.users.get(session_user)
                theme = user.theme
            template = app_state.jinja["en"].get_template("404.html")
            text = await template.render_async(
                {
                    "title": "404 Page Not Found",
                    "dev": DEV,
                    "home": URI,
                    "theme": theme,
                    "view_css": "404.css",
                    "asseturl": STATIC_ROOT,
                    "js": "/static/pychess-variants.js%s%s" % (BR_EXTENSION, SOURCE_VERSION),
                }
            )
            return web.Response(text=text, content_type="text/html")
        else:
            raise
    except NotInDbUsers:
        return web.HTTPFound("/")


@web.middleware
async def redirect_to_https(request, handler):
    # https://help.heroku.com/J2R1S4T8/can-heroku-force-an-application-to-use-ssl-tls
    # https://docs.aiohttp.org/en/stable/web_advanced.html#aiohttp-web-forwarded-support
    if request.headers.get("X-Forwarded-Proto") == "http":
        # request = request.clone(scheme="https")
        url = request.url.with_scheme("https").with_port(None)
        raise web.HTTPPermanentRedirect(url)

    return await handler(request)


async def on_prepare(request, response):
    if request.path.endswith(".br"):
        # brotli compressed js
        response.headers["Content-Encoding"] = "br"
        return
    elif (
        request.path.startswith("/variants")
        or request.path.startswith("/blogs")
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


def make_app(db_client=None, simple_cookie_storage=False, anon_as_test_users=False) -> Application:
    app = web.Application()
    app.middlewares.append(redirect_to_https)

    app["anon_as_test_users"] = anon_as_test_users

    parts = urlparse(URI)

    setup(
        app,
        (
            SimpleCookieStorage()
            if simple_cookie_storage
            else EncryptedCookieStorage(SECRET_KEY, max_age=MAX_AGE, secure=parts.scheme == "https")
        ),
    )

    if db_client is not None:
        app[client_key] = db_client
        app[db_key] = app[client_key][MONGO_DB_NAME]

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_cleanup.append(close_mongodb_client)
    app.on_response_prepare.append(on_prepare)

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1], allow_head=False)
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static", append_version=True)
    app.middlewares.append(handle_404)

    return app


async def init_state(app):
    if db_key not in app:
        app[db_key] = None

    app[pychess_global_app_state_key] = PychessGlobalAppState(app)
    await app[pychess_global_app_state_key].init_from_db()

    # create test tournament
    if 1:
        pass
        # from test_tournament import create_arena_test
        # await create_arena_test(app)

        # from test_tournament import create_dev_arena_tournament
        # await create_dev_arena_tournament(app)


async def shutdown(app):
    app_state = get_app_state(app)
    await app_state.server_shutdown()
    for task in asyncio.all_tasks():
        if task.get_name().startswith("Task-"):
            print(task)
        else:
            print(task.get_name())


async def close_mongodb_client(app):
    if client_key in app:
        app[client_key].close()
        log.debug("\nMongoClient closed OK.\n")


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
    parser.add_argument(
        "-s",
        action="store_true",
        help="Use SimpleCookieStorage. For testing purpose only!",
    )
    parser.add_argument(
        "-m",
        action="store_true",
        help="Verbose mongodb logging. Changes log level from INFO to DEBUG.",
    )
    parser.add_argument(
        "-a",
        action="store_true",
        help="Turn anon users to test users that behave like logged in real users.",
    )
    args = parser.parse_args()

    log.setLevel(
        level=logging.DEBUG if args.v else logging.WARNING if args.w else logging.INFO
    )

    logging.getLogger("pymongo").setLevel(logging.DEBUG if args.m else logging.INFO)

    app = make_app(
        db_client=AsyncIOMotorClient(MONGO_HOST, tz_aware=True),
        simple_cookie_storage=args.s,
        anon_as_test_users=args.a,
    )

    if DEV:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        # it is possible to pass a dictionary with local variables
        # to the python console environment
        locals_ = {"app": app, "state": pychess_global_app_state_key}
        # init monitor just before run_app
        with aiomonitor.start_monitor(loop=loop, locals=locals_):
            web.run_app(
                app,
                loop=loop,
                access_log=None if args.w else access_logger,
                port=int(os.environ.get("PORT", 8080)),
            )
    else:
        web.run_app(
            app,
            access_log=None if args.w else access_logger,
            port=int(os.environ.get("PORT", 8080)),
        )
