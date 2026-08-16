from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

import aiohttp_session
from aiohttp import web
from bson import ObjectId
from const import BLOCK, FOLLOW
from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from websocket_utils import ws_send_json_many

log = logging.getLogger(__name__)

TIMELINE_DISPLAY_MAX = 10
TIMELINE_PAGE_MAX = 30
TIMELINE_MAX_AGE = timedelta(days=14)
TIMELINE_RETENTION_SECONDS = int(TIMELINE_MAX_AGE.total_seconds())

TIMELINE_EVENT_TYPES = frozenset(
    {
        "follow",
        "forum-post",
        "ublog-post",
        "simul-create",
        "simul-join",
        "tournament-join",
    }
)


def _isoformat(value: object) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat()
    return ""


def _serialize_entry(doc: Mapping[str, Any]) -> dict[str, object] | None:
    event_type = doc.get("type")
    data = doc.get("data")
    date = _isoformat(doc.get("date"))
    if event_type not in TIMELINE_EVENT_TYPES or not isinstance(data, Mapping) or not date:
        return None
    return {
        "id": str(doc.get("_id", "")),
        "type": event_type,
        "data": dict(data),
        "date": date,
    }


class Timeline:
    def __init__(self, app_state: Any) -> None:
        self.app_state = app_state

    async def entries_for(
        self,
        username: str,
        *,
        limit: int = TIMELINE_DISPLAY_MAX,
        before: datetime | None = None,
    ) -> list[dict[str, object]]:
        if self.app_state.db is None or not username:
            return []

        now = datetime.now(UTC)
        date_filter: dict[str, datetime] = {"$gt": now - TIMELINE_MAX_AGE}
        if before is not None:
            date_filter["$lt"] = before

        cursor = self.app_state.db.timeline_entry.find(
            {"users": username, "date": date_filter},
            projection={"users": 0},
        )
        cursor.sort("date", -1).limit(max(0, min(limit, TIMELINE_PAGE_MAX)))
        docs = await cursor.to_list(length=TIMELINE_PAGE_MAX)
        entries: list[dict[str, object]] = []
        for doc in docs:
            entry = _serialize_entry(doc)
            if entry is not None:
                entries.append(entry)
        return entries

    async def _followers_of(self, username: str) -> set[str]:
        if self.app_state.db is None:
            return set()
        cursor = self.app_state.db.relation.find(
            {"u2": username, "r": FOLLOW},
            projection={"_id": 0, "u1": 1},
        )
        return {
            str(doc["u1"])
            async for doc in cursor
            if isinstance(doc.get("u1"), str) and doc["u1"] != username
        }

    async def _blocked_by(self, username: str) -> set[str]:
        if self.app_state.db is None:
            return set()
        cursor = self.app_state.db.relation.find(
            {"u1": username, "r": BLOCK},
            projection={"_id": 0, "u2": 1},
        )
        return {str(doc["u2"]) async for doc in cursor if isinstance(doc.get("u2"), str)}

    async def _friends_of(self, username: str) -> set[str]:
        followers = await self._followers_of(username)
        actor = self.app_state.users.data.get(username)
        if actor is not None:
            following = set(actor.following)
        elif self.app_state.db is None:
            following = set()
        else:
            following = {
                str(doc["u2"])
                async for doc in self.app_state.db.relation.find(
                    {"u1": username, "r": FOLLOW},
                    projection={"_id": 0, "u2": 1},
                )
                if isinstance(doc.get("u2"), str)
            }
        return followers.intersection(following)

    async def publish(
        self,
        event_type: str,
        actor: Any,
        data: Mapping[str, object],
        *,
        friends_only: bool = False,
        extra_users: Iterable[str] = (),
        exclude_users: Iterable[str] = (),
    ) -> None:
        if (
            self.app_state.db is None
            or event_type not in TIMELINE_EVENT_TYPES
            or actor is None
            or actor.anon
            or not actor.enabled
            or bool(getattr(actor, "shadowban", False))
        ):
            return

        try:
            recipients = (
                await self._friends_of(actor.username)
                if friends_only
                else await self._followers_of(actor.username)
            )
            recipients.update(str(username) for username in extra_users if username)
            recipients.difference_update(str(username) for username in exclude_users)
            recipients.difference_update(await self._blocked_by(actor.username))
            recipients.discard(actor.username)
            if not recipients:
                return

            event_data = {"actor": actor.username, **dict(data)}
            await self.app_state.db.timeline_entry.insert_one(
                {
                    "_id": ObjectId(),
                    "type": event_type,
                    "data": event_data,
                    "users": sorted(recipients),
                    "date": datetime.now(UTC),
                }
            )

            sockets = [
                ws
                for username in recipients
                for ws in tuple(self.app_state.lobby.lobbysockets.get(username, ()))
            ]
            if sockets:
                await ws_send_json_many(sockets, {"type": "reload_timeline"})
        except Exception:
            # Timeline delivery must never make the originating user action fail.
            log.exception(
                "Failed to publish %s timeline activity for %s", event_type, actor.username
            )

    async def remove_between(self, username1: str, username2: str) -> None:
        if self.app_state.db is None:
            return
        try:
            await self.app_state.db.timeline_entry.update_many(
                {"data.actor": username2, "users": username1},
                {"$pull": {"users": username1}},
            )
            await self.app_state.db.timeline_entry.update_many(
                {"data.actor": username1, "users": username2},
                {"$pull": {"users": username2}},
            )
        except Exception:
            log.exception(
                "Failed to remove timeline activities between %s and %s", username1, username2
            )

    async def erase_user(self, username: str) -> None:
        if self.app_state.db is None:
            return
        try:
            await self.app_state.db.timeline_entry.delete_many({"data.actor": username})
            await self.app_state.db.timeline_entry.update_many(
                {"users": username},
                {"$pull": {"users": username}},
            )
        except Exception:
            log.exception("Failed to erase timeline activities for %s", username)


def _before_from_request(request: web.Request) -> datetime | None:
    raw = request.rel_url.query.get("before")
    if not raw:
        return None
    try:
        milliseconds = int(raw)
        return datetime.fromtimestamp(milliseconds / 1000, tz=UTC)
    except ValueError, OverflowError, OSError:
        return None


async def timeline_api(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    username = session.get("user_name")
    if not isinstance(username, str):
        return json_response({"type": "error", "message": "Login required"}, status=403)
    user = await app_state.users.get(username)
    if user.anon:
        return json_response({"type": "error", "message": "Login required"}, status=403)

    try:
        limit = int(request.rel_url.query.get("nb", TIMELINE_DISPLAY_MAX))
    except ValueError:
        limit = TIMELINE_DISPLAY_MAX
    entries = await app_state.timeline.entries_for(
        user.username,
        limit=max(0, min(limit, TIMELINE_PAGE_MAX)),
        before=_before_from_request(request),
    )
    return json_response({"entries": entries})
