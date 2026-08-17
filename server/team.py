from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal

from aiohttp import web
from newid import id8
from pymongo.errors import DuplicateKeyError, PyMongoError

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

TEAM_MAX_JOINED = 50
TEAM_MAX_CREATED_PER_7_DAYS = 3
TEAM_MAX_LEADERS = 10
TEAM_MAX_ADMINS = 3
TEAM_NAME_MIN_LENGTH = 3
TEAM_NAME_MAX_LENGTH = 60
TEAM_INTRO_MIN_LENGTH = 3
TEAM_INTRO_MAX_LENGTH = 200
TEAM_DESCRIPTION_MIN_LENGTH = 30
TEAM_DESCRIPTION_MAX_LENGTH = 4000
TEAM_REQUEST_MIN_LENGTH = 30
TEAM_REQUEST_MAX_LENGTH = 2000
TEAM_ENTRY_CODE_MAX_LENGTH = 60
TEAM_UPDATE_MIN_LENGTH = 3
TEAM_UPDATE_MAX_LENGTH = 9000
TEAM_UPDATE_MAX_PER_7_DAYS = 10
TEAM_UPDATE_PAGE_SIZE = 150

TEAM_FORUM_ACCESS_NONE = "none"
TEAM_FORUM_ACCESS_LEADERS = "leaders"
TEAM_FORUM_ACCESS_MEMBERS = "members"
TEAM_FORUM_ACCESS_EVERYONE = "everyone"
TEAM_FORUM_ACCESS_VALUES = frozenset(
    {
        TEAM_FORUM_ACCESS_NONE,
        TEAM_FORUM_ACCESS_LEADERS,
        TEAM_FORUM_ACCESS_MEMBERS,
        TEAM_FORUM_ACCESS_EVERYONE,
    }
)
TEAM_FORUM_ACCESS_OPTIONS = (
    (TEAM_FORUM_ACCESS_EVERYONE, "Show to everyone"),
    (TEAM_FORUM_ACCESS_MEMBERS, "Show to team members"),
    (TEAM_FORUM_ACCESS_LEADERS, "Show to team leaders"),
    (TEAM_FORUM_ACCESS_NONE, "Hide the forum"),
)

PERMISSION_PUBLIC = "public"
PERMISSION_SETTINGS = "settings"
PERMISSION_TOURNAMENTS = "tournaments"
PERMISSION_MODERATION = "moderation"
PERMISSION_REQUESTS = "requests"
PERMISSION_UPDATES = "updates"
PERMISSION_KICK = "kick"
PERMISSION_ADMIN = "admin"

TEAM_PERMISSION_DEFINITIONS = (
    (PERMISSION_PUBLIC, "Public", "Visible as leader on the team page"),
    (PERMISSION_SETTINGS, "Settings", "Change settings and descriptions"),
    (PERMISSION_TOURNAMENTS, "Tournaments", "Create team tournaments"),
    (PERMISSION_MODERATION, "Moderation", "Moderate team forums and chats"),
    (PERMISSION_REQUESTS, "Requests", "Accept and decline join requests"),
    (PERMISSION_UPDATES, "Updates", "Send team updates to members"),
    (PERMISSION_KICK, "Kick", "Kick members from the team"),
    (PERMISSION_ADMIN, "Admin", "Manage leader permissions"),
)

TEAM_PERMISSIONS = frozenset(
    {
        PERMISSION_PUBLIC,
        PERMISSION_SETTINGS,
        PERMISSION_TOURNAMENTS,
        PERMISSION_MODERATION,
        PERMISSION_REQUESTS,
        PERMISSION_UPDATES,
        PERMISSION_KICK,
        PERMISSION_ADMIN,
    }
)

JoinResult = Literal["joined", "member", "requested", "pending"]


def _clean_text(value: object, *, max_length: int, field: str, min_length: int = 0) -> str:
    text = str(value or "").strip()
    if len(text) < min_length:
        raise web.HTTPBadRequest(text=f"{field} is too short.")
    if len(text) > max_length:
        raise web.HTTPBadRequest(text=f"{field} is too long.")
    return text


def _clean_optional_text(
    value: object, *, min_length: int, max_length: int, field: str
) -> str:
    text = _clean_text(value, max_length=max_length, field=field)
    if text and len(text) < min_length:
        raise web.HTTPBadRequest(text=f"{field} is too short.")
    return text


def team_id_from_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:50].strip("-")
    if len(slug) < 2:
        return id8().lower()
    if slug in {"new", "me", "all", "requests", "updates"}:
        slug = f"{slug}-{id8()[:4].lower()}"
    return slug


def _entry_code_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _entry_code_matches(team: Mapping[str, Any], value: str) -> bool:
    expected = str(team.get("entryCodeHash") or "")
    if not expected:
        return True
    actual = _entry_code_hash(value.strip())
    return hmac.compare_digest(expected, actual)


def _clean_forum_access(value: object, *, default: str = TEAM_FORUM_ACCESS_NONE) -> str:
    access = str(value or default).strip().lower()
    if access not in TEAM_FORUM_ACCESS_VALUES:
        raise web.HTTPBadRequest(text="Invalid team forum access setting.")
    return access


def _member_id(team_id: str, username: str) -> str:
    return f"{username}@{team_id}"


def _request_id(team_id: str, username: str) -> str:
    return f"{username}@{team_id}"


async def get_team(app_state: PychessGlobalAppState, team_id: str) -> Mapping[str, Any] | None:
    if app_state.db is None:
        return None
    return await app_state.db.team.find_one({"_id": team_id, "enabled": True})


async def get_team_member(
    app_state: PychessGlobalAppState, team_id: str, username: str
) -> Mapping[str, Any] | None:
    if app_state.db is None:
        return None
    return await app_state.db.team_member.find_one({"_id": _member_id(team_id, username)})


async def is_team_member(app_state: PychessGlobalAppState, team_id: str, username: str) -> bool:
    return await get_team_member(app_state, team_id, username) is not None


async def has_team_permission(
    app_state: PychessGlobalAppState,
    team_id: str,
    username: str,
    permission: str,
) -> bool:
    member = await get_team_member(app_state, team_id, username)
    if member is None:
        return False
    return permission in set(member.get("permissions") or ())


async def teams_for_user(
    app_state: PychessGlobalAppState,
    username: str,
    *,
    permission: str | None = None,
) -> list[Mapping[str, Any]]:
    if app_state.db is None:
        return []
    member_filter: dict[str, object] = {"user": username}
    if permission is not None:
        member_filter["permissions"] = permission
    memberships = await app_state.db.team_member.find(member_filter).to_list(length=TEAM_MAX_JOINED)
    team_ids = [str(member["team"]) for member in memberships]
    if not team_ids:
        return []
    teams = await app_state.db.team.find({"_id": {"$in": team_ids}, "enabled": True}).to_list(
        length=len(team_ids)
    )
    by_id = {str(team["_id"]): team for team in teams}
    return [by_id[team_id] for team_id in team_ids if team_id in by_id]


def _team_update_is_unread(update: Mapping[str, Any], member: Mapping[str, Any]) -> bool:
    created_at = update.get("createdAt")
    seen_at = member.get("updatesSeenAt")
    return isinstance(created_at, datetime) and (
        not isinstance(seen_at, datetime) or created_at > seen_at
    )


async def latest_team_update(
    app_state: PychessGlobalAppState, team_id: str
) -> Mapping[str, Any] | None:
    if app_state.db is None:
        return None
    updates = await (
        app_state.db.team_update.find({"team": team_id})
        .sort("createdAt", -1)
        .limit(1)
        .to_list(length=1)
    )
    return updates[0] if updates else None


async def team_updates_for_user(
    app_state: PychessGlobalAppState, username: str, *, limit: int = TEAM_UPDATE_PAGE_SIZE
) -> list[dict[str, Any]]:
    if app_state.db is None:
        return []
    memberships = await app_state.db.team_member.find(
        {"user": username, "updatesUnsubscribed": {"$ne": True}}
    ).to_list(length=TEAM_MAX_JOINED)
    if not memberships:
        return []
    team_ids = [str(member["team"]) for member in memberships]
    members_by_team = {str(member["team"]): member for member in memberships}
    teams = await app_state.db.team.find(
        {"_id": {"$in": team_ids}, "enabled": True}
    ).to_list(length=len(team_ids))
    teams_by_id = {str(team["_id"]): team for team in teams}
    updates = await (
        app_state.db.team_update.find({"team": {"$in": list(teams_by_id)}})
        .sort("createdAt", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    result: list[dict[str, Any]] = []
    for update in updates:
        team_id = str(update["team"])
        team = teams_by_id.get(team_id)
        member = members_by_team.get(team_id)
        if team is None or member is None:
            continue
        result.append(
            {
                **update,
                "teamName": str(team["name"]),
                "unread": _team_update_is_unread(update, member),
            }
        )
    return result


async def team_updates_for_member(
    app_state: PychessGlobalAppState,
    team_id: str,
    username: str,
    *,
    limit: int = TEAM_UPDATE_PAGE_SIZE,
) -> tuple[list[dict[str, Any]], bool]:
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    member = await get_team_member(app_state, team_id, username)
    if member is None:
        raise web.HTTPForbidden(text="You must be a team member to read team updates.")
    updates = await (
        app_state.db.team_update.find({"team": team_id})
        .sort("createdAt", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    decorated = [{**update, "unread": _team_update_is_unread(update, member)} for update in updates]
    seen_candidates = [
        update.get("createdAt")
        for update in updates
        if isinstance(update.get("createdAt"), datetime)
    ]
    seen_at = max(seen_candidates) if seen_candidates else datetime.now(UTC)
    await app_state.db.team_member.update_one(
        {"_id": _member_id(team_id, username)}, {"$set": {"updatesSeenAt": seen_at}}
    )
    return decorated, not bool(member.get("updatesUnsubscribed"))


async def team_update_quota_remaining(
    app_state: PychessGlobalAppState, team_id: str
) -> int:
    if app_state.db is None:
        return 0
    since = datetime.now(UTC) - timedelta(days=7)
    used = await app_state.db.team_update.count_documents(
        {"team": team_id, "createdAt": {"$gte": since}}
    )
    return max(0, TEAM_UPDATE_MAX_PER_7_DAYS - used)


async def _notify_team_update_subscribers(
    app_state: PychessGlobalAppState,
    team_id: str,
    team_name: str,
    sender: str,
    text: str,
) -> None:
    if app_state.db is None:
        return
    from notify import notify_by_username

    cursor = app_state.db.team_member.find(
        {"team": team_id, "updatesUnsubscribed": {"$ne": True}}
    )
    async for member in cursor:
        username = str(member.get("user") or "")
        if not username or username == sender:
            continue
        await notify_by_username(
            app_state,
            username,
            "teamUpdate",
            {"team": team_id, "name": team_name, "text": text[:160]},
        )


async def send_team_update(
    app_state: PychessGlobalAppState,
    team_id: str,
    sender: str,
    value: object,
) -> Mapping[str, Any]:
    if not await has_team_permission(app_state, team_id, sender, PERMISSION_UPDATES):
        raise web.HTTPForbidden(text="You cannot send updates for this team.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound(text="Team not found.")
    text = _clean_text(
        value,
        min_length=TEAM_UPDATE_MIN_LENGTH,
        max_length=TEAM_UPDATE_MAX_LENGTH,
        field="Team update",
    )
    now = datetime.now(UTC)
    since = now - timedelta(days=7)
    if (
        await app_state.db.team_update.count_documents(
            {"team": team_id, "createdAt": {"$gte": since}}
        )
        >= TEAM_UPDATE_MAX_PER_7_DAYS
    ):
        raise web.HTTPTooManyRequests(
            text=f"A team can send at most {TEAM_UPDATE_MAX_PER_7_DAYS} updates in seven days."
        )
    duplicate_since = now - timedelta(minutes=10)
    if await app_state.db.team_update.find_one(
        {"team": team_id, "text": text, "createdAt": {"$gte": duplicate_since}}
    ) is not None:
        raise web.HTTPConflict(text="You already sent this team update recently.")

    update: dict[str, Any] = {
        "_id": id8(),
        "team": team_id,
        "text": text,
        "sender": sender,
        "createdAt": now,
    }
    await app_state.db.team_update.insert_one(update)
    app_state.create_background_task(
        _notify_team_update_subscribers(app_state, team_id, str(team["name"]), sender, text),
        name=f"team-update-notify-{update['_id']}",
    )
    return update


async def set_team_update_subscription(
    app_state: PychessGlobalAppState, team_id: str, username: str, subscribed: bool
) -> None:
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    member = await get_team_member(app_state, team_id, username)
    if member is None:
        raise web.HTTPForbidden(text="You must be a team member to change update subscriptions.")
    if subscribed:
        update = {"$unset": {"updatesUnsubscribed": ""}}
    else:
        update = {"$set": {"updatesUnsubscribed": True}}
    await app_state.db.team_member.update_one({"_id": _member_id(team_id, username)}, update)


async def _joined_team_count(app_state: PychessGlobalAppState, username: str) -> int:
    if app_state.db is None:
        return 0
    return await app_state.db.team_member.count_documents({"user": username})


async def _created_team_count_last_week(app_state: PychessGlobalAppState, username: str) -> int:
    if app_state.db is None:
        return 0
    since = datetime.now(UTC) - timedelta(days=7)
    return await app_state.db.team.count_documents(
        {"createdBy": username, "createdAt": {"$gte": since}}
    )


async def create_team(
    app_state: PychessGlobalAppState,
    username: str,
    form: Mapping[str, Any],
) -> Mapping[str, Any]:
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")

    if await _joined_team_count(app_state, username) >= TEAM_MAX_JOINED:
        raise web.HTTPForbidden(text=f"You cannot join more than {TEAM_MAX_JOINED} teams.")
    if await _created_team_count_last_week(app_state, username) >= TEAM_MAX_CREATED_PER_7_DAYS:
        raise web.HTTPForbidden(
            text=f"You can create at most {TEAM_MAX_CREATED_PER_7_DAYS} teams in seven days."
        )

    name = _clean_text(
        form.get("name"),
        min_length=TEAM_NAME_MIN_LENGTH,
        max_length=TEAM_NAME_MAX_LENGTH,
        field="Team name",
    )
    intro = _clean_optional_text(
        form.get("intro"),
        min_length=TEAM_INTRO_MIN_LENGTH,
        max_length=TEAM_INTRO_MAX_LENGTH,
        field="Team intro",
    )
    description = _clean_text(
        form.get("description"),
        min_length=TEAM_DESCRIPTION_MIN_LENGTH,
        max_length=TEAM_DESCRIPTION_MAX_LENGTH,
        field="Team description",
    )
    entry_code = _clean_text(
        form.get("entryCode"), max_length=TEAM_ENTRY_CODE_MAX_LENGTH, field="Entry code"
    )
    team_id = team_id_from_name(name)
    now = datetime.now(UTC)
    team: dict[str, Any] = {
        "_id": team_id,
        "name": name,
        "intro": intro,
        "description": description,
        "requestRequired": form.get("requestRequired") == "1",
        "forumAccess": _clean_forum_access(form.get("forumAccess")),
        "memberCount": 1,
        "enabled": True,
        "createdBy": username,
        "createdAt": now,
        "updatedAt": now,
    }
    if entry_code:
        team["entryCodeHash"] = _entry_code_hash(entry_code)

    try:
        await app_state.db.team.insert_one(team)
    except DuplicateKeyError as exc:
        raise web.HTTPConflict(text="A team with this URL already exists.") from exc

    member = {
        "_id": _member_id(team_id, username),
        "team": team_id,
        "user": username,
        "joinedAt": now,
        "permissions": sorted(TEAM_PERMISSIONS),
    }
    try:
        await app_state.db.team_member.insert_one(member)
    except PyMongoError:
        await app_state.db.team.delete_one({"_id": team_id})
        raise
    return team


async def update_team(
    app_state: PychessGlobalAppState,
    team_id: str,
    username: str,
    form: Mapping[str, Any],
) -> None:
    if not await has_team_permission(app_state, team_id, username, PERMISSION_SETTINGS):
        raise web.HTTPForbidden(text="You cannot edit this team.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")

    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound(text="Team not found.")

    intro = _clean_optional_text(
        form.get("intro"),
        min_length=TEAM_INTRO_MIN_LENGTH,
        max_length=TEAM_INTRO_MAX_LENGTH,
        field="Team intro",
    )
    description = _clean_text(
        form.get("description"),
        min_length=TEAM_DESCRIPTION_MIN_LENGTH,
        max_length=TEAM_DESCRIPTION_MAX_LENGTH,
        field="Team description",
    )
    entry_code = _clean_text(
        form.get("entryCode"), max_length=TEAM_ENTRY_CODE_MAX_LENGTH, field="Entry code"
    )
    update: dict[str, Any] = {
        "intro": intro,
        "description": description,
        "requestRequired": form.get("requestRequired") == "1",
        "forumAccess": _clean_forum_access(
            form.get("forumAccess"),
            default=str(team.get("forumAccess") or TEAM_FORUM_ACCESS_NONE),
        ),
        "updatedAt": datetime.now(UTC),
    }
    mongo_update: dict[str, Any] = {"$set": update}
    if entry_code:
        update["entryCodeHash"] = _entry_code_hash(entry_code)
    elif form.get("clearEntryCode") == "1":
        mongo_update["$unset"] = {"entryCodeHash": ""}

    await app_state.db.team.update_one({"_id": team_id, "enabled": True}, mongo_update)


async def _add_member(app_state: PychessGlobalAppState, team_id: str, username: str) -> bool:
    if app_state.db is None:
        return False
    if await _joined_team_count(app_state, username) >= TEAM_MAX_JOINED:
        raise web.HTTPForbidden(text=f"You cannot join more than {TEAM_MAX_JOINED} teams.")
    member = {
        "_id": _member_id(team_id, username),
        "team": team_id,
        "user": username,
        "joinedAt": datetime.now(UTC),
        "permissions": [],
    }
    try:
        await app_state.db.team_member.insert_one(member)
    except DuplicateKeyError:
        return False
    await app_state.db.team.update_one({"_id": team_id}, {"$inc": {"memberCount": 1}})
    return True


async def join_or_request_team(
    app_state: PychessGlobalAppState,
    team: Mapping[str, Any],
    username: str,
    form: Mapping[str, Any],
) -> JoinResult:
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    team_id = str(team["_id"])
    if await is_team_member(app_state, team_id, username):
        return "member"

    existing_request = await app_state.db.team_request.find_one(
        {"_id": _request_id(team_id, username)}
    )
    if existing_request is not None:
        if existing_request.get("declined"):
            raise web.HTTPForbidden(text="Your request to join this team was declined.")
        return "pending"

    entry_code = str(form.get("entryCode") or "")
    if not _entry_code_matches(team, entry_code):
        raise web.HTTPForbidden(text="Incorrect team entry code.")

    if team.get("requestRequired"):
        message = _clean_text(
            form.get("message"),
            min_length=TEAM_REQUEST_MIN_LENGTH,
            max_length=TEAM_REQUEST_MAX_LENGTH,
            field="Join request message",
        )
        await app_state.db.team_request.insert_one(
            {
                "_id": _request_id(team_id, username),
                "team": team_id,
                "user": username,
                "message": message,
                "createdAt": datetime.now(UTC),
                "declined": False,
            }
        )
        return "requested"

    await _add_member(app_state, team_id, username)
    return "joined"


async def cancel_join_request(
    app_state: PychessGlobalAppState, team_id: str, username: str
) -> None:
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    result = await app_state.db.team_request.delete_one(
        {"_id": _request_id(team_id, username), "declined": False}
    )
    if not result.deleted_count:
        raise web.HTTPNotFound(text="Pending join request not found.")


async def _remove_user_from_active_team_tournaments(
    app_state: PychessGlobalAppState, team_id: str, username: str
) -> None:
    if app_state.db is None:
        return

    # Imported lazily to keep team membership helpers usable from the tournament module
    # without creating a module-level import cycle.
    from const import T_CREATED, T_STARTED
    from tournament.tournaments import load_tournament

    user = await app_state.users.get(username)
    cursor = app_state.db.tournament.find(
        {"teamId": team_id, "status": {"$in": (T_CREATED, T_STARTED)}}
    )
    async for tournament_doc in cursor:
        tournament = await load_tournament(app_state, str(tournament_doc["_id"]))
        if tournament is not None:
            await tournament.team_member_removed(user)


async def quit_team(app_state: PychessGlobalAppState, team_id: str, username: str) -> None:
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound(text="Team not found.")
    if username == team.get("createdBy"):
        raise web.HTTPForbidden(text="The team creator cannot leave the team.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    result = await app_state.db.team_member.delete_one({"_id": _member_id(team_id, username)})
    if result.deleted_count:
        await app_state.db.team.update_one(
            {"_id": team_id},
            {"$inc": {"memberCount": -1}, "$set": {"updatedAt": datetime.now(UTC)}},
        )
        await _remove_user_from_active_team_tournaments(app_state, team_id, username)


async def process_join_request(
    app_state: PychessGlobalAppState,
    team_id: str,
    moderator: str,
    username: str,
    decision: str,
) -> None:
    if not await has_team_permission(app_state, team_id, moderator, PERMISSION_REQUESTS):
        raise web.HTTPForbidden(text="You cannot manage join requests for this team.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    request_id = _request_id(team_id, username)
    request_doc = await app_state.db.team_request.find_one({"_id": request_id})
    if request_doc is None:
        raise web.HTTPNotFound(text="Join request not found.")

    if decision == "accept":
        await _add_member(app_state, team_id, username)
        await app_state.db.team_request.delete_one({"_id": request_id})
    elif decision == "decline":
        await app_state.db.team_request.update_one(
            {"_id": request_id},
            {"$set": {"declined": True, "processedAt": datetime.now(UTC)}},
        )
    else:
        raise web.HTTPBadRequest(text="Unknown request decision.")


async def kick_team_member(
    app_state: PychessGlobalAppState,
    team_id: str,
    moderator: str,
    username: str,
) -> None:
    if not await has_team_permission(app_state, team_id, moderator, PERMISSION_KICK):
        raise web.HTTPForbidden(text="You cannot kick members from this team.")
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound(text="Team not found.")
    if username == team.get("createdBy"):
        raise web.HTTPForbidden(text="The team creator cannot be kicked.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")

    result = await app_state.db.team_member.delete_one({"_id": _member_id(team_id, username)})
    if not result.deleted_count:
        raise web.HTTPNotFound(text="Team member not found.")
    await app_state.db.team.update_one(
        {"_id": team_id}, {"$inc": {"memberCount": -1}, "$set": {"updatedAt": datetime.now(UTC)}}
    )
    await _remove_user_from_active_team_tournaments(app_state, team_id, username)
    now = datetime.now(UTC)
    await app_state.db.team_request.update_one(
        {"_id": _request_id(team_id, username)},
        {
            "$set": {
                "team": team_id,
                "user": username,
                "message": "Kicked from team",
                "createdAt": now,
                "processedAt": now,
                "declined": True,
            }
        },
        upsert=True,
    )


async def add_team_leader(
    app_state: PychessGlobalAppState,
    team_id: str,
    admin: str,
    username: str,
) -> None:
    if not await has_team_permission(app_state, team_id, admin, PERMISSION_ADMIN):
        raise web.HTTPForbidden(text="You cannot manage team leaders.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")

    username = username.strip()
    if not username:
        raise web.HTTPBadRequest(text="Username is required.")
    member = await get_team_member(app_state, team_id, username)
    if member is None:
        raise web.HTTPBadRequest(text="This user is not a member of the team.")
    if member.get("permissions"):
        raise web.HTTPConflict(text="This user is already a team leader.")

    leader_count = await app_state.db.team_member.count_documents(
        {"team": team_id, "permissions.0": {"$exists": True}}
    )
    if leader_count >= TEAM_MAX_LEADERS:
        raise web.HTTPForbidden(text=f"A team can have at most {TEAM_MAX_LEADERS} leaders.")

    await app_state.db.team_member.update_one(
        {"_id": _member_id(team_id, username)},
        {"$set": {"permissions": [PERMISSION_PUBLIC]}},
    )


async def update_team_leader_permissions(
    app_state: PychessGlobalAppState,
    team_id: str,
    admin: str,
    leaders: Mapping[str, set[str]],
) -> None:
    if not await has_team_permission(app_state, team_id, admin, PERMISSION_ADMIN):
        raise web.HTTPForbidden(text="You cannot manage team leaders.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound(text="Team not found.")

    current = await app_state.db.team_member.find(
        {"team": team_id, "permissions.0": {"$exists": True}}
    ).to_list(length=TEAM_MAX_LEADERS + 1)
    current_names = {str(member["user"]) for member in current}
    if set(leaders) != current_names:
        raise web.HTTPBadRequest(text="Leader list changed; reload the page and try again.")
    if len(current_names) > TEAM_MAX_LEADERS:
        raise web.HTTPBadRequest(text="Too many team leaders.")

    for permissions in leaders.values():
        if not permissions <= TEAM_PERMISSIONS:
            raise web.HTTPBadRequest(text="Unknown team permission.")

    creator = str(team.get("createdBy") or "")
    creator_permissions = leaders.get(creator, set())
    if PERMISSION_ADMIN not in creator_permissions:
        raise web.HTTPBadRequest(text="The team creator must keep the Admin permission.")

    admin_count = sum(PERMISSION_ADMIN in permissions for permissions in leaders.values())
    if admin_count == 0:
        raise web.HTTPBadRequest(text="At least one leader must be able to manage permissions.")
    if admin_count > TEAM_MAX_ADMINS:
        raise web.HTTPBadRequest(text=f"A team can have at most {TEAM_MAX_ADMINS} admins.")

    for username, permissions in leaders.items():
        await app_state.db.team_member.update_one(
            {"_id": _member_id(team_id, username)},
            {"$set": {"permissions": sorted(permissions)}},
        )
