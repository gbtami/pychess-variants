from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from time import monotonic
from typing import Awaitable, Callable

from aiohttp import web

from typedefs import request_protection_state_key

log = logging.getLogger(__name__)

Handler = Callable[[web.Request], Awaitable[web.StreamResponse]]


@dataclass(frozen=True)
class RouteRateLimit:
    """Simple per-route-group limit definition."""

    name: str
    max_requests: int
    window_seconds: float


class SlidingWindowLimiter:
    """
    Lightweight in-memory limiter suitable for single-dyno deployments.

    We intentionally keep this tiny and dependency-free:
    - O(1)-ish operations per request (deque append/pop)
    - bounded map size to protect low-memory dynos
    - periodic stale-key cleanup to avoid unbounded growth
    """

    def __init__(self, max_keys: int = 20_000, cleanup_interval_seconds: float = 15.0) -> None:
        self._events: dict[str, deque[float]] = {}
        self._max_keys = max_keys
        self._cleanup_interval_seconds = cleanup_interval_seconds
        self._last_cleanup = 0.0

    def allow(self, key: str, max_requests: int, window_seconds: float) -> bool:
        now = monotonic()
        self._cleanup_if_needed(now)

        events = self._events.get(key)
        if events is None:
            if len(self._events) >= self._max_keys:
                self._cleanup(now, force=True)
                # If still full, fail open for this request.
                # Keeping gameplay available is preferable to a memory-driven outage.
                if len(self._events) >= self._max_keys:
                    return True
            events = deque()
            self._events[key] = events

        cutoff = now - window_seconds
        while events and events[0] <= cutoff:
            events.popleft()

        if len(events) >= max_requests:
            return False

        events.append(now)
        return True

    def _cleanup_if_needed(self, now: float) -> None:
        if now - self._last_cleanup >= self._cleanup_interval_seconds:
            self._cleanup(now, force=False)

    def _cleanup(self, now: float, force: bool) -> None:
        # Slow-path cleanup: drop empty/stale buckets.
        for key, events in tuple(self._events.items()):
            if not events:
                del self._events[key]
                continue
            if force:
                # Forced cleanup is used only when key-map reached capacity.
                # Use a broad stale cutoff to recover memory quickly.
                stale_cutoff = now - 120.0
            else:
                stale_cutoff = now - self._cleanup_interval_seconds
            if events[-1] <= stale_cutoff:
                del self._events[key]
        self._last_cleanup = now


class RequestProtectionState:
    """
    Central request protection state.

    This intentionally combines:
    1) early scanner-path suppression (standalone aiohttp equivalent of an edge deny-list)
    2) app-level per-route-group rate limits for DB-touching endpoints
    """

    _SCANNER_PREFIXES = (
        "/wp-admin",
        "/wp-content",
        "/xmlrpc.php",
        "/phpmyadmin",
        "/cgi-bin",
        "/vendor/phpunit",
        "/.env",
        "/boaform",
        "/HNAP1",
    )

    _PROFILE_LIMIT = RouteRateLimit("profile", max_requests=40, window_seconds=30.0)
    _WS_HANDSHAKE_LIMIT = RouteRateLimit("wsr", max_requests=80, window_seconds=30.0)
    _NAMES_LIMIT = RouteRateLimit("names", max_requests=20, window_seconds=30.0)
    _STATUS_LIMIT = RouteRateLimit("status", max_requests=20, window_seconds=30.0)
    _PROFILE_API_LIMIT = RouteRateLimit("profile_api", max_requests=30, window_seconds=30.0)
    _EXPORT_LIMIT = RouteRateLimit("export", max_requests=6, window_seconds=60.0)
    _GAME_VIEW_LIMIT = RouteRateLimit("game_view", max_requests=45, window_seconds=30.0)
    _PUZZLE_LIMIT = RouteRateLimit("puzzle", max_requests=30, window_seconds=30.0)
    _STATIC_API_SEGMENTS = frozenset(
        {
            "account",
            "stream",
            "bot",
            "blocks",
            "calendar",
            "stats",
            "games",
            "users",
            "invites",
            "ongoing",
            "names",
            "challenge",
            "check-username",
            "confirm-username",
            "token",
        }
    )

    def __init__(self) -> None:
        self._limiter = SlidingWindowLimiter()
        self._last_block_log: dict[str, float] = {}

    def classify(self, path: str) -> RouteRateLimit | None:
        # Keep checks cheap and explicit; this runs on every request.
        if path.startswith("/@/"):
            return self._PROFILE_LIMIT
        if path.startswith("/wsr/"):
            return self._WS_HANDSHAKE_LIMIT
        if path == "/api/names":
            return self._NAMES_LIMIT
        if path == "/api/users/status":
            return self._STATUS_LIMIT
        if path.startswith("/api/"):
            parts = path.split("/")
            # Dynamic user-centric endpoints use "/api/{profileId}/...". Those
            # can still produce avoidable work (DB checks or deliberate sleeps)
            # on random profile probes and should be throttled more aggressively
            # than static API endpoints.
            if len(parts) >= 4 and parts[2] not in self._STATIC_API_SEGMENTS:
                return self._PROFILE_API_LIMIT
        if path.startswith("/games/export/"):
            return self._EXPORT_LIMIT
        if path.startswith("/games/json/"):
            return self._PROFILE_API_LIMIT
        if (
            path.startswith("/invite/")
            or path.startswith("/embed/")
            or path.startswith("/corranalysis/")
        ):
            return self._GAME_VIEW_LIMIT
        if path.startswith("/puzzle/"):
            return self._PUZZLE_LIMIT
        # Game page dynamic route: "/{gameId}" where gameId is 8 chars.
        # We require at least one digit or uppercase letter to avoid matching
        # fixed lowercase routes like "/analysis" or "/calendar".
        if len(path) == 9 and path[0] == "/":
            game_id_candidate = path[1:]
            if game_id_candidate.replace("_", "a").isalnum() and (
                any(ch.isdigit() for ch in game_id_candidate)
                or any(ch.isupper() for ch in game_id_candidate)
            ):
                return self._GAME_VIEW_LIMIT
        return None

    def is_known_scanner_path(self, path: str) -> bool:
        lowered = path.lower()
        return any(lowered.startswith(prefix.lower()) for prefix in self._SCANNER_PREFIXES)

    def client_key(self, request: web.Request) -> str:
        # Heroku forwards client IP in X-Forwarded-For.
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",", maxsplit=1)[0].strip()
        return request.remote or "unknown"

    def should_log_block(self, key: str) -> bool:
        now = monotonic()
        prev = self._last_block_log.get(key, 0.0)
        if now - prev < 30.0:
            return False
        self._last_block_log[key] = now
        return True

    def allow(self, key: str, route_limit: RouteRateLimit) -> bool:
        return self._limiter.allow(key, route_limit.max_requests, route_limit.window_seconds)


@web.middleware
async def request_protection_middleware(
    request: web.Request, handler: Handler
) -> web.StreamResponse:
    state: RequestProtectionState = request.app[request_protection_state_key]
    path = request.path
    client = state.client_key(request)

    if state.is_known_scanner_path(path):
        scanner_key = f"scanner:{client}"
        if not state._limiter.allow(scanner_key, max_requests=8, window_seconds=60.0):
            if state.should_log_block(scanner_key):
                log.warning("scanner path flood blocked from %s on %s", client, path)
            raise web.HTTPTooManyRequests(headers={"Retry-After": "60"})
        # Return 404 for scanner signatures to avoid signaling valid app routes.
        raise web.HTTPNotFound()

    route_limit = state.classify(path)
    if route_limit is None:
        return await handler(request)

    bucket = f"{route_limit.name}:{client}"
    if state.allow(bucket, route_limit):
        return await handler(request)

    if state.should_log_block(bucket):
        log.warning(
            "rate-limited %s from %s at path %s (%s req / %ss)",
            route_limit.name,
            client,
            path,
            route_limit.max_requests,
            route_limit.window_seconds,
        )
    retry_after = max(1, int(route_limit.window_seconds))
    raise web.HTTPTooManyRequests(headers={"Retry-After": str(retry_after)})
