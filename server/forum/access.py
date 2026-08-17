from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from team import (
    PERMISSION_MODERATION,
    TEAM_FORUM_ACCESS_EVERYONE,
    TEAM_FORUM_ACCESS_LEADERS,
    TEAM_FORUM_ACCESS_MEMBERS,
    TEAM_FORUM_ACCESS_NONE,
    get_team,
    get_team_member,
)

import forum.permissions as forum_permissions

TEAM_FORUM_CATEG_PREFIX = "team-"


def team_forum_categ_id(team_id: str) -> str:
    return f"{TEAM_FORUM_CATEG_PREFIX}{team_id}"


def team_id_from_forum_categ_id(categ_id: str) -> str | None:
    if not categ_id.startswith(TEAM_FORUM_CATEG_PREFIX):
        return None
    team_id = categ_id.removeprefix(TEAM_FORUM_CATEG_PREFIX)
    return team_id or None


def team_id_from_forum_categ(categ: Mapping[str, Any]) -> str | None:
    stored = categ.get("teamId")
    if isinstance(stored, str) and stored:
        return stored
    return team_id_from_forum_categ_id(str(categ.get("_id") or ""))


async def can_read_forum_categ(
    app_state: Any,
    categ: Mapping[str, Any],
    username: str | None,
) -> bool:
    """Return whether a viewer may read a forum category."""
    team_id = team_id_from_forum_categ(categ)
    if team_id is None:
        return True
    if username is not None and forum_permissions.is_admin(username):
        return True

    team = await get_team(app_state, team_id)
    if team is None:
        return False
    access = str(team.get("forumAccess") or TEAM_FORUM_ACCESS_NONE)
    if access == TEAM_FORUM_ACCESS_EVERYONE:
        return True
    if access == TEAM_FORUM_ACCESS_NONE or username is None:
        return False

    member = await get_team_member(app_state, team_id, username)
    if member is None:
        return False
    if access == TEAM_FORUM_ACCESS_MEMBERS:
        return True
    if access == TEAM_FORUM_ACCESS_LEADERS:
        return bool(member.get("permissions"))
    return False


async def can_write_forum_categ(
    app_state: Any,
    categ: Mapping[str, Any],
    user: Any,
) -> bool:
    """Return whether a user may create topics/posts/reactions in a category."""
    if user is None or not forum_permissions.can_write(user):
        return False

    team_id = team_id_from_forum_categ(categ)
    if team_id is None:
        return True

    team = await get_team(app_state, team_id)
    if team is None:
        return False
    access = str(team.get("forumAccess") or TEAM_FORUM_ACCESS_NONE)
    if access == TEAM_FORUM_ACCESS_NONE:
        return False

    member = await get_team_member(app_state, team_id, user.username)
    if member is None:
        # Even public team forums are read-only to non-members, matching lichess.
        return False
    if access == TEAM_FORUM_ACCESS_LEADERS:
        return bool(member.get("permissions"))
    return access in {TEAM_FORUM_ACCESS_EVERYONE, TEAM_FORUM_ACCESS_MEMBERS}


async def can_moderate_forum_categ(
    app_state: Any,
    categ: Mapping[str, Any],
    user: Any,
) -> bool:
    """Return whether a user may moderate this category."""
    if user is None:
        return False
    if forum_permissions.can_moderate(user):
        return True

    team_id = team_id_from_forum_categ(categ)
    if team_id is None:
        return False
    member = await get_team_member(app_state, team_id, user.username)
    return member is not None and PERMISSION_MODERATION in set(member.get("permissions") or ())
