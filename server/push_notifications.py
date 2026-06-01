"""Web push notifications for correspondence moves.

Design notes for contributors:
- Move handling only enqueues lightweight jobs; network I/O runs in a background worker.
- Delivery is best-effort. We retry transient failures, keep bounded subscriptions per user,
  and prune stale endpoints reported by push services.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import aiohttp_session
from aiohttp import web
from tenacity import (
    AsyncRetrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from settings import PUSH_VAPID_PRIVATE_KEY, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_SUBJECT

if TYPE_CHECKING:
    from user import User

log = logging.getLogger(__name__)

try:
    from pywebpush import WebPushException, webpush
    from py_vapid import Vapid
except ImportError:  # pragma: no cover - covered via config fallback in runtime
    WebPushException = Exception  # type: ignore[assignment]
    webpush = None
    Vapid = None


PUSH_SUBSCRIPTION_COLLECTION = "push_subscription"
PUSH_QUEUE_MAXSIZE = 2048
MAX_SUBSCRIPTIONS_PER_USER = 5
PUSH_RETRY_MAX_ATTEMPTS = 3
PUSH_RETRY_WAIT_INITIAL_SECONDS = 1.0
PUSH_RETRY_WAIT_MAX_SECONDS = 30.0
PUSH_RETRY_WAIT_JITTER_SECONDS = 0.5
RETRYABLE_PUSH_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class CorrMovePushJob:
    """Minimal payload needed to build a turn notification."""

    username: str
    game_id: str
    opponent: str
    san: str


class PushSendRetryableError(Exception):
    """Raised for retryable delivery failures handled by tenacity."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class PushNotifier:
    @staticmethod
    def _strip_wrapping_quotes(value: str) -> str:
        if len(value) >= 2 and (
            (value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")
        ):
            return value[1:-1]
        return value

    @classmethod
    def _normalize_vapid_private_key(cls, raw_value: str) -> str:
        key = cls._strip_wrapping_quotes(raw_value.strip())
        # Accept env values that store PEM newlines as escaped sequences.
        if "\\n" in key:
            key = key.replace("\\n", "\n")
        return key.strip()

    @staticmethod
    def _validate_vapid_private_key(private_key: str) -> tuple[bool, str | None]:
        if Vapid is None:
            return (False, "py_vapid is not available")

        try:
            if "-----BEGIN PRIVATE KEY-----" in private_key:
                Vapid.from_pem(private_key.encode("utf-8"))
            else:
                Vapid.from_string(private_key)
            return (True, None)
        except Exception as exc:
            return (False, f"{type(exc).__name__}: {exc}")

    def __init__(self, app_state):
        self.app_state = app_state
        self.queue: asyncio.Queue[CorrMovePushJob] = asyncio.Queue(maxsize=PUSH_QUEUE_MAXSIZE)

        private_key = self._normalize_vapid_private_key(PUSH_VAPID_PRIVATE_KEY)
        vapid_public_key = self._strip_wrapping_quotes(PUSH_VAPID_PUBLIC_KEY.strip())

        self.vapid_private_key = private_key
        self.vapid_public_key = vapid_public_key
        self.vapid_private_key_for_send: str | Any = private_key
        self.vapid_claims: dict[str, str | int] = {"sub": PUSH_VAPID_SUBJECT}
        self.retry_attempts = PUSH_RETRY_MAX_ATTEMPTS
        self.retry_wait_initial_seconds = PUSH_RETRY_WAIT_INITIAL_SECONDS
        self.retry_wait_max_seconds = PUSH_RETRY_WAIT_MAX_SECONDS
        self.retry_wait_jitter_seconds = PUSH_RETRY_WAIT_JITTER_SECONDS
        self.enabled = (
            self.app_state.db is not None
            and bool(self.vapid_private_key)
            and bool(self.vapid_public_key)
            and webpush is not None
        )

        if self.app_state.db is None:
            log.info("Web push disabled: database not configured")
        elif webpush is None:
            log.warning("Web push disabled: pywebpush is not installed")
        elif not self.vapid_public_key:
            log.info("Web push disabled: PUSH_VAPID_PUBLIC_KEY is not configured")
        elif not self.vapid_private_key:
            log.info("Web push disabled: PUSH_VAPID_PRIVATE_KEY is not configured")
        else:
            private_key_ok, private_key_error = self._validate_vapid_private_key(
                self.vapid_private_key
            )
            if not private_key_ok:
                self.enabled = False
                log.error(
                    "Web push disabled: invalid PUSH_VAPID_PRIVATE_KEY format (%s)",
                    private_key_error,
                )
            elif "-----BEGIN PRIVATE KEY-----" in self.vapid_private_key:
                # pywebpush parses string keys via Vapid.from_string(), which
                # does not accept PEM. Convert PEM to a Vapid instance once.
                try:
                    if Vapid is None:
                        raise RuntimeError("py_vapid is not available")
                    self.vapid_private_key_for_send = Vapid.from_pem(
                        self.vapid_private_key.encode("utf-8")
                    )
                except Exception as exc:
                    self.enabled = False
                    log.error(
                        "Web push disabled: failed to prepare VAPID key object (%s: %s)",
                        type(exc).__name__,
                        exc,
                    )

    def enqueue_corr_move(self, user: User, game_id: str, opponent: str, san: str) -> None:
        """Queue a corr-move notification when the user is eligible."""

        if not self.enabled:
            log.debug(
                "Skipping corr push enqueue for %s game=%s: notifier disabled",
                user.username,
                game_id,
            )
            return
        if user.anon or user.bot:
            log.debug(
                "Skipping corr push enqueue for %s game=%s: anon=%s bot=%s",
                user.username,
                game_id,
                user.anon,
                user.bot,
            )
            return
        if not user.corr_push_enabled:
            log.debug(
                "Skipping corr push enqueue for %s game=%s: preference disabled",
                user.username,
                game_id,
            )
            return
        if user.is_user_active_in_game(game_id) or user.is_user_active_in_lobby():
            log.debug(
                "Skipping corr push enqueue for %s game=%s: user active game=%s lobby=%s",
                user.username,
                game_id,
                user.is_user_active_in_game(game_id),
                user.is_user_active_in_lobby(),
            )
            return

        job = CorrMovePushJob(
            username=user.username,
            game_id=game_id,
            opponent=opponent,
            san=san,
        )
        try:
            self.queue.put_nowait(job)
            log.debug(
                "Queued corr push job for %s game=%s queue_size=%s",
                user.username,
                game_id,
                self.queue.qsize(),
            )
        except asyncio.QueueFull:
            log.warning("Push queue full; dropping corr move push for %s", user.username)

    async def run(self) -> None:
        """Long-running worker consuming queued push jobs."""

        while True:
            job = await self.queue.get()
            try:
                await self._deliver_corr_move(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Failed to deliver push notification to %s", job.username)
            finally:
                self.queue.task_done()

    async def _deliver_corr_move(self, job: CorrMovePushJob) -> None:
        """Deliver one job across recent user subscriptions.

        We intentionally continue per endpoint on errors so one bad subscription
        does not block sends to other devices.
        """

        if self.app_state.db is None or webpush is None:
            return

        cursor = self.app_state.db[PUSH_SUBSCRIPTION_COLLECTION].find({"user": job.username})
        cursor.sort("seenAt", -1)
        cursor.limit(MAX_SUBSCRIPTIONS_PER_USER)
        subscriptions = await cursor.to_list(length=MAX_SUBSCRIPTIONS_PER_USER)
        if len(subscriptions) == 0:
            log.info(
                "No push subscriptions for %s; skipping corr push delivery game=%s",
                job.username,
                job.game_id,
            )
            return

        log.debug(
            "Delivering corr push to %s subscriptions=%s game=%s",
            job.username,
            len(subscriptions),
            job.game_id,
        )

        payload = json.dumps(
            {
                "title": "It's your turn!",
                "body": f"{job.opponent} played {job.san}",
                "tag": "corr-move",
                "payload": {
                    "url": f"/{job.game_id}",
                    "gameId": job.game_id,
                },
            }
        )

        stale_endpoints: list[str] = []
        sent_count = 0
        for subscription in subscriptions:
            endpoint = str(subscription.get("endpoint", ""))
            auth = str(subscription.get("auth", ""))
            p256dh = str(subscription.get("p256dh", ""))
            if not endpoint or not auth or not p256dh:
                log.debug(
                    "Skipping malformed subscription for %s endpoint=%s",
                    job.username,
                    endpoint if endpoint else "<empty>",
                )
                continue

            subscription_info = {
                "endpoint": endpoint,
                "keys": {
                    "auth": auth,
                    "p256dh": p256dh,
                },
            }

            try:
                await self._send_with_retry(subscription_info, payload)
                sent_count += 1
                log.debug("Push sent for %s endpoint=%s", job.username, endpoint)
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in (404, 410):
                    # Endpoint is gone; remove it after this loop.
                    stale_endpoints.append(endpoint)
                else:
                    log.warning(
                        "Push send failed for %s endpoint=%s status=%s",
                        job.username,
                        endpoint,
                        status_code,
                    )
            except PushSendRetryableError as exc:
                log.warning(
                    "Push send transient failure for %s endpoint=%s status=%s",
                    job.username,
                    endpoint,
                    exc.status_code,
                )
            except Exception:
                log.exception("Unexpected push send failure for %s", job.username)

        if len(stale_endpoints) > 0:
            await self.app_state.db[PUSH_SUBSCRIPTION_COLLECTION].delete_many(
                {
                    "user": job.username,
                    "endpoint": {"$in": stale_endpoints},
                }
            )
            log.info(
                "Removed stale push endpoints for %s count=%s",
                job.username,
                len(stale_endpoints),
            )

        log.debug(
            "Finished corr push delivery for %s game=%s sent=%s stale=%s",
            job.username,
            job.game_id,
            sent_count,
            len(stale_endpoints),
        )

    async def _send_with_retry(self, subscription_info: dict, payload: str) -> None:
        """Send push payload with bounded retry for transient errors only."""

        send_webpush = webpush
        if send_webpush is None:
            raise RuntimeError("pywebpush is not available")

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(self.retry_attempts),
            wait=wait_exponential_jitter(
                initial=self.retry_wait_initial_seconds,
                max=self.retry_wait_max_seconds,
                jitter=self.retry_wait_jitter_seconds,
            ),
            retry=retry_if_exception_type(PushSendRetryableError),
            before_sleep=before_sleep_log(log, logging.WARNING),
            reraise=True,
        ):
            with attempt:
                try:
                    await asyncio.to_thread(
                        send_webpush,
                        subscription_info=subscription_info,
                        data=payload,
                        vapid_private_key=self.vapid_private_key_for_send,
                        vapid_claims=self.vapid_claims,
                    )
                except WebPushException as exc:
                    status_code = getattr(getattr(exc, "response", None), "status_code", None)
                    if status_code in RETRYABLE_PUSH_STATUS_CODES:
                        # Push providers can temporarily reject requests (rate limit/5xx).
                        raise PushSendRetryableError(
                            "Retryable web push failure",
                            status_code=status_code,
                        ) from exc
                    raise
                except Exception as exc:
                    raise PushSendRetryableError(
                        f"Retryable push delivery failure: {type(exc).__name__}: {exc}"
                    ) from exc


async def service_worker(request: web.Request) -> web.StreamResponse:
    """Serve service worker from app root so scope works for all pages."""

    sw_path = Path(__file__).resolve().parent.parent / "static" / "service-worker.js"
    return web.FileResponse(
        sw_path,
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/",
        },
    )


async def push_subscribe(request: web.Request) -> web.StreamResponse:
    """Upsert a browser push subscription for the authenticated user."""

    app_state = get_app_state(request.app)
    if app_state.db is None:
        log.warning("Push subscribe rejected: database unavailable")
        return json_response({"error": "Push service unavailable."}, status=503)
    if not app_state.push_notifier.enabled:
        log.warning("Push subscribe rejected: notifier is not configured")
        return json_response({"error": "Push service is not configured."}, status=503)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        log.warning("Push subscribe rejected: authentication required")
        return json_response({"error": "Authentication required."}, status=401)

    user = await app_state.users.get(session_user)
    if user.anon:
        log.warning("Push subscribe rejected for %s: anon user", session_user)
        return json_response({"error": "Authenticated users only."}, status=403)

    try:
        body = await request.json()
    except Exception:
        log.warning("Push subscribe rejected for %s: invalid JSON body", user.username)
        return json_response({"error": "Invalid JSON body."}, status=400)

    if not isinstance(body, dict):
        log.warning("Push subscribe rejected for %s: payload is not an object", user.username)
        return json_response({"error": "Invalid subscription payload."}, status=400)

    keys = body.get("keys")
    endpoint = body.get("endpoint")
    if not isinstance(keys, dict) or not isinstance(endpoint, str) or endpoint.strip() == "":
        log.warning("Push subscribe rejected for %s: missing endpoint or keys", user.username)
        return json_response({"error": "Missing endpoint or keys."}, status=400)

    auth = keys.get("auth")
    p256dh = keys.get("p256dh")
    if not isinstance(auth, str) or auth.strip() == "":
        log.warning("Push subscribe rejected for %s: missing keys.auth", user.username)
        return json_response({"error": "Missing keys.auth."}, status=400)
    if not isinstance(p256dh, str) or p256dh.strip() == "":
        log.warning("Push subscribe rejected for %s: missing keys.p256dh", user.username)
        return json_response({"error": "Missing keys.p256dh."}, status=400)

    now = datetime.now(timezone.utc)
    await app_state.db[PUSH_SUBSCRIPTION_COLLECTION].update_one(
        {
            "user": user.username,
            "endpoint": endpoint,
        },
        {
            "$set": {
                "auth": auth,
                "p256dh": p256dh,
                "seenAt": now,
            },
            "$setOnInsert": {
                "createdAt": now,
            },
        },
        upsert=True,
    )

    cursor = app_state.db[PUSH_SUBSCRIPTION_COLLECTION].find({"user": user.username})
    cursor.sort("seenAt", -1)
    subscriptions = await cursor.to_list(length=100)
    if len(subscriptions) > MAX_SUBSCRIPTIONS_PER_USER:
        stale_endpoints = [
            subscription["endpoint"]
            for subscription in subscriptions[MAX_SUBSCRIPTIONS_PER_USER:]
            if isinstance(subscription.get("endpoint"), str)
        ]
        if len(stale_endpoints) > 0:
            await app_state.db[PUSH_SUBSCRIPTION_COLLECTION].delete_many(
                {
                    "user": user.username,
                    "endpoint": {"$in": stale_endpoints},
                }
            )
            log.info(
                "Trimmed push subscriptions for %s removed=%s",
                user.username,
                len(stale_endpoints),
            )

    log.info(
        "Push subscription upserted for %s endpoint=%s",
        user.username,
        endpoint,
    )

    return json_response({"ok": True})


async def push_unsubscribe(request: web.Request) -> web.StreamResponse:
    """Remove one endpoint subscription, or all user subscriptions as fallback."""

    app_state = get_app_state(request.app)
    if app_state.db is None:
        log.warning("Push unsubscribe rejected: database unavailable")
        return json_response({"error": "Push service unavailable."}, status=503)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        log.warning("Push unsubscribe rejected: authentication required")
        return json_response({"error": "Authentication required."}, status=401)

    user = await app_state.users.get(session_user)
    if user.anon:
        log.warning("Push unsubscribe rejected for %s: anon user", session_user)
        return json_response({"error": "Authenticated users only."}, status=403)

    endpoint = ""
    try:
        body = await request.json()
    except Exception:
        body = None
    if isinstance(body, dict):
        maybe_endpoint = body.get("endpoint")
        if isinstance(maybe_endpoint, str):
            endpoint = maybe_endpoint.strip()

    if endpoint != "":
        await app_state.db[PUSH_SUBSCRIPTION_COLLECTION].delete_many(
            {"user": user.username, "endpoint": endpoint}
        )
        log.info("Push endpoint removed for %s endpoint=%s", user.username, endpoint)
    else:
        await app_state.db[PUSH_SUBSCRIPTION_COLLECTION].delete_many({"user": user.username})
        log.info("All push endpoints removed for %s", user.username)

    return json_response({"ok": True})
