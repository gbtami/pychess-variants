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
TIMELINE_FORUM_CHANNEL_PREFIX = "forum:"

TIMELINE_EVENT_TYPES = frozenset(
    {
        "follow",
        "forum-post",
        "ublog-post",
        "ublog-post-like",
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

        query: dict[str, object] = {"users": username, "date": date_filter}
        readable_team_ids = await self._readable_team_forum_ids(username, date_filter)
        if readable_team_ids is not None:
            query["$or"] = [
                {"teamId": {"$exists": False}},
                {"teamId": {"$in": sorted(readable_team_ids)}},
            ]

        cursor = self.app_state.db.timeline_entry.find(query, projection={"users": 0})
        cursor.sort("date", -1).limit(max(0, min(limit, TIMELINE_PAGE_MAX)))
        docs = await cursor.to_list(length=TIMELINE_PAGE_MAX)
        entries: list[dict[str, object]] = []
        for doc in docs:
            entry = _serialize_entry(doc)
            if entry is not None:
                entries.append(entry)
        return entries

    async def _readable_team_forum_ids(
        self, username: str, date_filter: Mapping[str, datetime]
    ) -> set[str] | None:
        """Return current team-forum access for team-scoped timeline entries.

        ``None`` means no team filter is needed (site admin).
        """
        if self.app_state.db is None:
            return set()

        from forum.permissions import is_admin
        from team import (
            TEAM_FORUM_ACCESS_EVERYONE,
            TEAM_FORUM_ACCESS_LEADERS,
            TEAM_FORUM_ACCESS_MEMBERS,
        )

        if is_admin(username):
            return None

        team_ids = await self.app_state.db.timeline_entry.distinct(
            "teamId", {"users": username, "date": dict(date_filter)}
        )
        team_ids = [team_id for team_id in team_ids if isinstance(team_id, str) and team_id]
        if not team_ids:
            return set()

        teams = await self.app_state.db.team.find(
            {"_id": {"$in": team_ids}, "enabled": True},
            projection={"_id": 1, "forumAccess": 1},
        ).to_list(length=len(team_ids))
        memberships = await self.app_state.db.team_member.find(
            {"team": {"$in": team_ids}, "user": username},
            projection={"_id": 0, "team": 1, "permissions": 1},
        ).to_list(length=len(team_ids))
        members = {str(member["team"]): member for member in memberships}

        readable: set[str] = set()
        for team in teams:
            team_id = str(team.get("_id") or "")
            access = str(team.get("forumAccess") or "none")
            member = members.get(team_id)
            if (
                access == TEAM_FORUM_ACCESS_EVERYONE
                or access == TEAM_FORUM_ACCESS_MEMBERS
                and member is not None
                or (
                    access == TEAM_FORUM_ACCESS_LEADERS
                    and member is not None
                    and member.get("permissions")
                )
            ):
                readable.add(team_id)
        return readable

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

    @staticmethod
    def _can_unsubscribe(channel: str) -> bool:
        if not channel.startswith(TIMELINE_FORUM_CHANNEL_PREFIX):
            return False
        topic_id = channel.removeprefix(TIMELINE_FORUM_CHANNEL_PREFIX)
        return len(topic_id) == 8 and topic_id.isalnum()

    async def channel_status(self, username: str, channel: str) -> bool | None:
        """Return True when muted, False when applicable, and None when not applicable."""
        if self.app_state.db is None or not username or not self._can_unsubscribe(channel):
            return None

        unsubscribed = await self.app_state.db.timeline_unsub.find_one(
            {"user": username, "channel": channel}, projection={"_id": 1}
        )
        if unsubscribed is not None:
            return True

        recent_entry = await self.app_state.db.timeline_entry.find_one(
            {
                "users": username,
                "channel": channel,
                "date": {"$gt": datetime.now(UTC) - TIMELINE_MAX_AGE},
            },
            projection={"_id": 1},
        )
        return False if recent_entry is not None else None

    async def set_channel_unsubscribed(
        self, username: str, channel: str, unsubscribed: bool
    ) -> bool:
        if self.app_state.db is None or not username or not self._can_unsubscribe(channel):
            return False

        selector = {"user": username, "channel": channel}
        if unsubscribed:
            await self.app_state.db.timeline_unsub.update_one(
                selector,
                {"$set": selector},
                upsert=True,
            )
        else:
            await self.app_state.db.timeline_unsub.delete_one(selector)
        return True

    async def _filter_channel_unsubscribed(self, channel: str | None, recipients: set[str]) -> None:
        if (
            self.app_state.db is None
            or not channel
            or not recipients
            or not self._can_unsubscribe(channel)
        ):
            return
        cursor = self.app_state.db.timeline_unsub.find(
            {"channel": channel, "user": {"$in": list(recipients)}},
            projection={"_id": 0, "user": 1},
        )
        unsubscribed_users = {
            str(doc["user"]) async for doc in cursor if isinstance(doc.get("user"), str)
        }
        recipients.difference_update(unsubscribed_users)

    async def _filter_team_forum_access(self, team_id: str | None, recipients: set[str]) -> None:
        if self.app_state.db is None or not team_id or not recipients:
            return

        from forum.permissions import is_admin
        from team import (
            TEAM_FORUM_ACCESS_EVERYONE,
            TEAM_FORUM_ACCESS_LEADERS,
            TEAM_FORUM_ACCESS_MEMBERS,
            TEAM_FORUM_ACCESS_NONE,
            get_team,
        )

        team = await get_team(self.app_state, team_id)
        admins = {username for username in recipients if is_admin(username)}
        if team is None:
            recipients.intersection_update(admins)
            return

        access = str(team.get("forumAccess") or TEAM_FORUM_ACCESS_NONE)
        if access == TEAM_FORUM_ACCESS_EVERYONE:
            return
        if access == TEAM_FORUM_ACCESS_NONE:
            recipients.intersection_update(admins)
            return

        memberships = await self.app_state.db.team_member.find(
            {"team": team_id, "user": {"$in": list(recipients)}},
            projection={"_id": 0, "user": 1, "permissions": 1},
        ).to_list(length=len(recipients))
        if access == TEAM_FORUM_ACCESS_MEMBERS:
            allowed = {str(member.get("user") or "") for member in memberships}
        elif access == TEAM_FORUM_ACCESS_LEADERS:
            allowed = {
                str(member.get("user") or "") for member in memberships if member.get("permissions")
            }
        else:
            allowed = set()
        allowed.update(admins)
        recipients.intersection_update(allowed)

    async def publish(
        self,
        event_type: str,
        actor: Any,
        data: Mapping[str, object],
        *,
        friends_only: bool = False,
        channel: str | None = None,
        extra_users: Iterable[str] = (),
        exclude_users: Iterable[str] = (),
        team_id: str | None = None,
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
            await self._filter_team_forum_access(team_id, recipients)
            await self._filter_channel_unsubscribed(channel, recipients)
            if not recipients:
                return

            event_data = {"actor": actor.username, **dict(data)}
            entry = {
                "_id": ObjectId(),
                "type": event_type,
                "data": event_data,
                "users": sorted(recipients),
                "date": datetime.now(UTC),
            }
            if channel:
                entry["channel"] = channel
            if team_id:
                entry["teamId"] = team_id
            await self.app_state.db.timeline_entry.insert_one(entry)

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
            await self.app_state.db.timeline_unsub.delete_many({"user": username})
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


async def timeline_unsubscribe(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    username = session.get("user_name")
    if not isinstance(username, str):
        return json_response({"type": "error", "message": "Login required"}, status=403)
    user = await app_state.users.get(username)
    if user.anon:
        return json_response({"type": "error", "message": "Login required"}, status=403)

    data = await request.post()
    channel = str(data.get("channel") or "")
    unsubscribed = str(data.get("unsubscribed") or "").lower() == "true"
    if not await app_state.timeline.set_channel_unsubscribed(user.username, channel, unsubscribed):
        return json_response({"type": "error", "message": "Invalid timeline channel"}, status=400)
    return json_response({"ok": True, "unsubscribed": unsubscribed})
