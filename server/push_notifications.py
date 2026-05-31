from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import aiohttp_session
from aiohttp import web

from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from settings import PUSH_VAPID_PRIVATE_KEY, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_SUBJECT

if TYPE_CHECKING:
    from user import User

log = logging.getLogger(__name__)

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - covered via config fallback in runtime
    WebPushException = Exception  # type: ignore[assignment]
    webpush = None


PUSH_SUBSCRIPTION_COLLECTION = "push_subscription"
PUSH_QUEUE_MAXSIZE = 2048
MAX_SUBSCRIPTIONS_PER_USER = 5
PUSH_RETRY_BASE_DELAY_SECONDS = 5.0
PUSH_RETRY_MAX_DELAY_SECONDS = 60.0
PUSH_RETRY_MAX_ATTEMPTS = 3
RETRYABLE_PUSH_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class CorrMovePushJob:
    username: str
    game_id: str
    opponent: str
    san: str
    attempt: int = 0


class PushNotifier:
    def __init__(self, app_state):
        self.app_state = app_state
        self.queue: asyncio.Queue[CorrMovePushJob] = asyncio.Queue(maxsize=PUSH_QUEUE_MAXSIZE)

        private_key = PUSH_VAPID_PRIVATE_KEY.strip()
        if "\\n" in private_key:
            private_key = private_key.replace("\\n", "\n")

        self.vapid_private_key = private_key
        self.vapid_public_key = PUSH_VAPID_PUBLIC_KEY.strip()
        self.vapid_claims = {"sub": PUSH_VAPID_SUBJECT}
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

    def enqueue_corr_move(self, user: User, game_id: str, opponent: str, san: str) -> None:
        if not self.enabled:
            return
        if user.anon or user.bot:
            return
        if not user.corr_push_enabled:
            return
        if user.is_user_active_in_game(game_id) or user.is_user_active_in_lobby():
            return

        job = CorrMovePushJob(
            username=user.username,
            game_id=game_id,
            opponent=opponent,
            san=san,
        )
        try:
            self.queue.put_nowait(job)
        except asyncio.QueueFull:
            log.warning("Push queue full; dropping corr move push for %s", user.username)

    async def run(self) -> None:
        while True:
            job = await self.queue.get()
            try:
                should_retry = await self._deliver_corr_move(job)
                if should_retry:
                    self._schedule_retry(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Failed to deliver push notification to %s", job.username)
            finally:
                self.queue.task_done()

    async def _deliver_corr_move(self, job: CorrMovePushJob) -> bool:
        if self.app_state.db is None or webpush is None:
            return False

        cursor = self.app_state.db[PUSH_SUBSCRIPTION_COLLECTION].find({"user": job.username})
        cursor.sort("seenAt", -1)
        cursor.limit(MAX_SUBSCRIPTIONS_PER_USER)
        subscriptions = await cursor.to_list(length=MAX_SUBSCRIPTIONS_PER_USER)
        if len(subscriptions) == 0:
            return False

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
        transient_failure_count = 0
        for subscription in subscriptions:
            endpoint = str(subscription.get("endpoint", ""))
            auth = str(subscription.get("auth", ""))
            p256dh = str(subscription.get("p256dh", ""))
            if not endpoint or not auth or not p256dh:
                continue

            subscription_info = {
                "endpoint": endpoint,
                "keys": {
                    "auth": auth,
                    "p256dh": p256dh,
                },
            }

            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=self.vapid_claims,
                )
                sent_count += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in (404, 410):
                    stale_endpoints.append(endpoint)
                elif status_code in RETRYABLE_PUSH_STATUS_CODES:
                    transient_failure_count += 1
                    log.warning(
                        "Push send transient failure for %s endpoint=%s status=%s",
                        job.username,
                        endpoint,
                        status_code,
                    )
                else:
                    log.warning(
                        "Push send failed for %s endpoint=%s status=%s",
                        job.username,
                        endpoint,
                        status_code,
                    )
            except Exception:
                transient_failure_count += 1
                log.exception("Unexpected push send failure for %s", job.username)

        if len(stale_endpoints) > 0:
            await self.app_state.db[PUSH_SUBSCRIPTION_COLLECTION].delete_many(
                {
                    "user": job.username,
                    "endpoint": {"$in": stale_endpoints},
                }
            )
        return sent_count == 0 and transient_failure_count > 0

    def _schedule_retry(self, job: CorrMovePushJob) -> None:
        if job.attempt >= PUSH_RETRY_MAX_ATTEMPTS:
            log.warning(
                "Push send exhausted retries for %s game=%s attempts=%s",
                job.username,
                job.game_id,
                job.attempt,
            )
            return

        retry_job = CorrMovePushJob(
            username=job.username,
            game_id=job.game_id,
            opponent=job.opponent,
            san=job.san,
            attempt=job.attempt + 1,
        )
        delay = min(
            PUSH_RETRY_MAX_DELAY_SECONDS,
            PUSH_RETRY_BASE_DELAY_SECONDS * (2**job.attempt),
        )
        self.app_state.create_background_task(
            self._enqueue_after_delay(retry_job, delay),
            name=f"push-retry-{job.username}-{retry_job.attempt}",
        )

    async def _enqueue_after_delay(self, job: CorrMovePushJob, delay_seconds: float) -> None:
        await asyncio.sleep(delay_seconds)
        try:
            self.queue.put_nowait(job)
        except asyncio.QueueFull:
            log.warning(
                "Push queue full; dropping corr move push retry for %s attempt=%s",
                job.username,
                job.attempt,
            )


async def service_worker(request: web.Request) -> web.StreamResponse:
    sw_path = Path(__file__).resolve().parent.parent / "static" / "service-worker.js"
    return web.FileResponse(
        sw_path,
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/",
        },
    )


async def push_subscribe(request: web.Request) -> web.StreamResponse:
    app_state = get_app_state(request.app)
    if app_state.db is None:
        return json_response({"error": "Push service unavailable."}, status=503)
    if not app_state.push_notifier.enabled:
        return json_response({"error": "Push service is not configured."}, status=503)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    if session_user is None:
        return json_response({"error": "Authentication required."}, status=401)

    user = await app_state.users.get(session_user)
    if user.anon:
        return json_response({"error": "Authenticated users only."}, status=403)

    try:
        body = await request.json()
    except Exception:
        return json_response({"error": "Invalid JSON body."}, status=400)

    if not isinstance(body, dict):
        return json_response({"error": "Invalid subscription payload."}, status=400)

    keys = body.get("keys")
    endpoint = body.get("endpoint")
    if not isinstance(keys, dict) or not isinstance(endpoint, str) or endpoint.strip() == "":
        return json_response({"error": "Missing endpoint or keys."}, status=400)

    auth = keys.get("auth")
    p256dh = keys.get("p256dh")
    if not isinstance(auth, str) or auth.strip() == "":
        return json_response({"error": "Missing keys.auth."}, status=400)
    if not isinstance(p256dh, str) or p256dh.strip() == "":
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

    return json_response({"ok": True})
