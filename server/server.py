from __future__ import annotations

import logger
import argparse
import asyncio
import faulthandler
import logging
import os
from urllib.parse import urlparse

from aiohttp import web
from aiohttp.web_app import Application
from aiohttp_session import SimpleCookieStorage
from aiohttp_session.cookie_storage import EncryptedCookieStorage
import aiohttp_cors
import aiohttp_jinja2
import aiohttp_session
import jinja2

from pymongo import AsyncMongoClient
from aiohttp_swagger3 import SwaggerDocs, SwaggerInfo

from db_wrapper import AsyncDBWrapper
from middlewares import (
    cross_origin_policy_middleware,
    handle_404,
    redirect_to_canonical_host,
    redirect_to_https,
    request_timing_middleware,
    set_user_locale,
)
from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from request_protection import RequestProtectionState, request_protection_middleware

from typedefs import (
    client_key,
    anon_as_test_users_key,
    pychess_global_app_state_key,
    db_key,
    request_protection_state_key,
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

log = logging.getLogger(__name__)

faulthandler.enable()


def make_app(
    db_client: AsyncMongoClient | None = None,
    simple_cookie_storage: bool = False,
    anon_as_test_users: bool = False,
) -> Application:

    app = web.Application()

    swagger = SwaggerDocs(
        app,
        validate=False,
        info=SwaggerInfo(title="Pychess API", version="1.0.0"),
    )

    app.middlewares.append(redirect_to_https)
    app.middlewares.append(redirect_to_canonical_host)
    app[request_protection_state_key] = RequestProtectionState()
    app.middlewares.append(request_protection_middleware)
    app.middlewares.append(request_timing_middleware)
    app.middlewares.append(cross_origin_policy_middleware)

    app[anon_as_test_users_key] = anon_as_test_users

    parts = urlparse(URI)
    is_secure = parts.scheme == "https"

    aiohttp_session.setup(
        app,
        (
            SimpleCookieStorage()
            if simple_cookie_storage
            else EncryptedCookieStorage(
                SECRET_KEY,
                max_age=MAX_AGE,
                secure=is_secure,
                samesite="None" if is_secure else "Lax",
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
        raw_db = app[client_key][MONGO_DB_NAME]
        # app[db_key] = raw_db
        app[db_key] = AsyncDBWrapper(raw_db)

    app.on_startup.append(init_state)
    app.on_shutdown.append(shutdown)
    app.on_cleanup.append(close_mongodb_client)

    async def openapi_json(request):
        return web.json_response(swagger.spec)

    app.router.add_get("/openapi.json", openapi_json)

    # Setup routes.
    swagger_get_routes = {
        "/api/games",
        "/api/games/{variant}",
        "/api/games/user/{profileId}",
        "/api/games/user/{profileId}/pgn",
    }
    for route in get_routes:
        path, handler = route
        if path in swagger_get_routes:
            swagger.add_get(
                path,
                handler,
                allow_head=False,
            )
        else:
            app.router.add_get(path, handler, allow_head=False)

    for route in post_routes:
        path, handler = route
        app.router.add_post(path, handler)

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
    for route in tuple(app.router.routes()):
        cors.add(route)

    return app


async def init_state(app: Application) -> None:
    if db_key not in app:
        app[db_key] = None

    app[pychess_global_app_state_key] = PychessGlobalAppState(app)
    app_state = app[pychess_global_app_state_key]
    await app_state.init_from_db()
    from forum.storage import ensure_categs

    await ensure_categs(app_state)
    refresh_task = await logger.start_config_refresh_timer(app[db_key])
    if refresh_task is not None:
        app_state.track_background_task(refresh_task)
    from forum import forum_captcha_refresher

    app_state.create_background_task(
        forum_captcha_refresher(app),
        name="forum-captcha-refresh",
    )

    # create test tournament
    if 1:
        # from tournament.auto_play_tournament import create_auto_play_tournament
        # await create_auto_play_tournament(app)
        pass


async def shutdown(app: Application) -> None:
    app_state = get_app_state(app)
    await app_state.server_shutdown()


async def close_mongodb_client(app: Application) -> None:
    if client_key in app:
        try:
            await app[client_key].close()
            log.debug("\nAsyncMongoClient closed OK.\n")
        except TypeError:
            close_result = app[client_key].close()
            if asyncio.iscoroutine(close_result):
                await close_result
            log.debug("\nAsyncMongoMockClient closed OK.\n")


if __name__ == "__main__":
    logger.init_default_logger()
    parser = argparse.ArgumentParser(description="PyChess chess variants server")
    parser.add_argument(
        "-s",
        action="store_true",
        help="Use SimpleCookieStorage. For testing purpose only!",
    )
    parser.add_argument(
        "-a",
        action="store_true",
        help="Turn anon users to test users that behave like logged in real users.",
    )
    args = parser.parse_args()

    db_client = AsyncMongoClient(
        MONGO_HOST,
        tz_aware=True,
        retryReads=True,
        retryWrites=True,
        serverSelectionTimeoutMS=3000,
        connectTimeoutMS=3000,
    )

    app = make_app(
        db_client=db_client,
        simple_cookie_storage=args.s,
        anon_as_test_users=args.a,
    )

    web.run_app(
        app,
        access_log=None,
        port=int(os.environ.get("PORT", 8080)),
    )
