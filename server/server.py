from __future__ import annotations

import argparse
import asyncio
import logging
import os
from urllib.parse import urlparse

from aiohttp import web
from aiohttp.log import access_logger
from aiohttp.web_app import Application
from aiohttp_session import SimpleCookieStorage
from aiohttp_session.cookie_storage import EncryptedCookieStorage
import aiohttp_cors
import aiohttp_jinja2
import aiohttp_session
import jinja2

from pymongo import AsyncMongoClient

from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state

from typedefs import (
    client_key,
    anon_as_test_users_key,
    pychess_global_app_state_key,
    db_key,
)
from routes import get_routes, post_routes
from settings import (
    ALLOWED_ORIGINS,
    MAX_AGE,
    SECRET_KEY,
    MONGO_HOST,
    MONGO_DB_NAME,
    URI,
)
from users import NotInDbUsers
from views import page404
from lang import LOCALE
from logger import log


@web.middleware
async def handle_404(request, handler):
    try:
        return await handler(request)
    except web.HTTPException as ex:
        if ex.status == 404:
            response = await page404.page404(request)
            return response
            raise
    except NotInDbUsers:
        return web.HTTPFound("/")
    except asyncio.CancelledError:
        # Prevent emitting endless tracebacks on server shutdown
        return web.Response()


@web.middleware
async def redirect_to_https(request, handler):
    # https://help.heroku.com/J2R1S4T8/can-heroku-force-an-application-to-use-ssl-tls
    # https://docs.aiohttp.org/en/stable/web_advanced.html#aiohttp-web-forwarded-support
    if request.headers.get("X-Forwarded-Proto") == "http":
        # request = request.clone(scheme="https")
        url = request.url.with_scheme("https").with_port(None)
        raise web.HTTPPermanentRedirect(url)

    return await handler(request)


@web.middleware
async def set_user_locale(request, handler):
    session = await aiohttp_session.get_session(request)
    LOCALE.set(session.get("lang", "en"))
    return await handler(request)


@web.middleware
async def cross_origin_policy_middleware(request, handler):
    response = await handler(request)
    if (
        request.path.startswith("/variants")
        or request.path.startswith("/blogs")
        or request.path.startswith("/video")
    ):
        # Learn and News pages may have links to other sites
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    else:
        # required to get stockfish.wasm in Firefox
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"

        if request.match_info.get("gameId") is not None:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Expires"] = "0"
    return response


def make_app(db_client=None, simple_cookie_storage=False, anon_as_test_users=False) -> Application:
    app = web.Application()
    app.middlewares.append(redirect_to_https)
    app.middlewares.append(cross_origin_policy_middleware)

    app[anon_as_test_users_key] = anon_as_test_users

    parts = urlparse(URI)

    aiohttp_session.setup(
        app,
        (
            SimpleCookieStorage()
            if simple_cookie_storage
            else EncryptedCookieStorage(
                SECRET_KEY, max_age=MAX_AGE, secure=parts.scheme == "https", samesite="Lax"
            )
        ),
    )

    app.middlewares.append(set_user_locale)

    aiohttp_jinja2.setup(
        app,
        enable_async=True,
        extensions=["jinja2.ext.i18n"],
        loader=jinja2.FileSystemLoader("templates"),
        autoescape=jinja2.select_autoescape(["html"]),
    )

    if db_client is not None:
        app[client_key] = db_client
        app[db_key] = app[client_key][MONGO_DB_NAME]

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_cleanup.append(close_mongodb_client)

    # Setup routes.
    for route in get_routes:
        app.router.add_get(route[0], route[1], allow_head=False)
    for route in post_routes:
        app.router.add_post(route[0], route[1])
    app.router.add_static("/static", "static", append_version=True)
    app.middlewares.append(handle_404)

    # Configure default CORS settings.
    cors = aiohttp_cors.setup(
        app,
        defaults={
            origin: aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
            )
            for origin in ALLOWED_ORIGINS
        },
    )

    # Configure CORS on all routes.
    for route in list(app.router.routes()):
        cors.add(route)

    return app


async def init_state(app):
    if db_key not in app:
        app[db_key] = None

    app[pychess_global_app_state_key] = PychessGlobalAppState(app)
    await app[pychess_global_app_state_key].init_from_db()

    # create test tournament
    if 1:
        pass
        # from tournament.auto_play_arena import create_auto_play_arena
        # await create_auto_play_arena(app)


async def shutdown(app):
    app_state = get_app_state(app)
    await app_state.server_shutdown()


async def close_mongodb_client(app):
    if client_key in app:
        try:
            await app[client_key].close()
            log.debug("\nAsyncMongoClient closed OK.\n")
        except TypeError:
            app[client_key].close()
            log.debug("\nAsyncMongoMockClient closed OK.\n")


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

    loglevel = logging.DEBUG if args.v else logging.WARNING if args.w else logging.INFO

    log.setLevel(level=loglevel)
    logging.getLogger("asyncio").setLevel(loglevel)

    logging.getLogger("pymongo").setLevel(logging.DEBUG if args.m else logging.INFO)

    app = make_app(
        db_client=AsyncMongoClient(MONGO_HOST, tz_aware=True),
        simple_cookie_storage=args.s,
        anon_as_test_users=args.a,
    )

    web.run_app(
        app,
        access_log=None if args.w else access_logger,
        port=int(os.environ.get("PORT", 8080)),
    )
