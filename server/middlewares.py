from __future__ import annotations

import asyncio
import logging
import os
from random import random
from time import monotonic
from typing import Awaitable, Callable

import aiohttp_session
from aiohttp import web

from lang import LOCALE
from users import NotInDbUsers
from views import page404

log = logging.getLogger(__name__)
Handler = Callable[[web.Request], Awaitable[web.StreamResponse]]


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        log.warning("Invalid %s=%r, using default=%s", name, value, default)
        return default


# Slow-request tracing is intentionally lightweight:
# - only logs errors and slow requests by default
# - excludes long-lived websocket/SSE endpoints unless explicitly enabled
REQUEST_TRACE_SLOW_MS = _env_float("REQUEST_TRACE_SLOW_MS", 500.0)
REQUEST_TRACE_SAMPLE_RATE = _env_float("REQUEST_TRACE_SAMPLE_RATE", 0.0)
REQUEST_TRACE_INCLUDE_LONG_LIVED = os.getenv("REQUEST_TRACE_INCLUDE_LONG_LIVED", "0") == "1"
LONG_LIVED_PREFIXES = (
    "/wsl",
    "/wsr/",
    "/wst",
    "/wss",
    "/notify",
    "/api/ongoing",
    "/api/invites/",
    "/api/stream/",
    "/api/bot/game/stream/",
)


def _is_long_lived_path(path: str) -> bool:
    return path.startswith(LONG_LIVED_PREFIXES)


def _should_trace_request(path: str, status: int, duration_ms: float) -> bool:
    if status >= 500:
        return True

    if duration_ms >= REQUEST_TRACE_SLOW_MS:
        if REQUEST_TRACE_INCLUDE_LONG_LIVED:
            return True
        return not _is_long_lived_path(path)

    if REQUEST_TRACE_SAMPLE_RATE <= 0.0:
        return False

    if not REQUEST_TRACE_INCLUDE_LONG_LIVED and _is_long_lived_path(path):
        return False
    return random() < REQUEST_TRACE_SAMPLE_RATE


@web.middleware
async def handle_404(request: web.Request, handler: Handler) -> web.StreamResponse:
    try:
        return await handler(request)
    except web.HTTPException as ex:
        if ex.status == 404:
            response = await page404.page404(request)
            return response
        # IMPORTANT: re-raise all other HTTP errors
        raise
    except NotInDbUsers:
        return web.HTTPFound("/")
    except asyncio.CancelledError:
        # Prevent emitting endless tracebacks on server shutdown
        return web.Response()


@web.middleware
async def redirect_to_https(request: web.Request, handler: Handler) -> web.StreamResponse:
    # https://help.heroku.com/J2R1S4T8/can-heroku-force-an-application-to-use-ssl-tls
    # https://docs.aiohttp.org/en/stable/web_advanced.html#aiohttp-web-forwarded-support
    if request.headers.get("X-Forwarded-Proto") == "http":
        # request = request.clone(scheme="https")
        url = request.url.with_scheme("https").with_port(None)
        raise web.HTTPPermanentRedirect(url)

    return await handler(request)


@web.middleware
async def set_user_locale(request: web.Request, handler: Handler) -> web.StreamResponse:
    session = await aiohttp_session.get_session(request)
    LOCALE.set(session.get("lang", "en"))
    return await handler(request)


@web.middleware
async def cross_origin_policy_middleware(
    request: web.Request, handler: Handler
) -> web.StreamResponse:
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


@web.middleware
async def request_timing_middleware(request: web.Request, handler: Handler) -> web.StreamResponse:
    started = monotonic()
    status = 500
    try:
        response = await handler(request)
        status = response.status
        return response
    except web.HTTPException as ex:
        status = ex.status
        raise
    except asyncio.CancelledError:
        raise
    except Exception:
        status = 500
        raise
    finally:
        duration_ms = (monotonic() - started) * 1000.0
        path = request.rel_url.path
        if _should_trace_request(path, status, duration_ms):
            request_id = request.headers.get("X-Request-ID", "-")
            forwarded_for = request.headers.get("X-Forwarded-For", request.remote or "-")
            client_ip = forwarded_for.split(",", maxsplit=1)[0].strip()
            log.warning(
                "request-trace method=%s path=%s status=%s dur_ms=%.1f req_id=%s fwd=%s",
                request.method,
                path,
                status,
                duration_ms,
                request_id,
                client_ip,
            )
