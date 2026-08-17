from __future__ import annotations

from typing import Any

import aiohttp_jinja2
from aiohttp import web
from forum.access import can_read_forum_categ, team_forum_categ_id
from forum.storage import ensure_team_forum
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from team import (
    PERMISSION_ADMIN,
    PERMISSION_KICK,
    PERMISSION_PUBLIC,
    PERMISSION_REQUESTS,
    PERMISSION_SETTINGS,
    PERMISSION_TOURNAMENTS,
    PERMISSION_UPDATES,
    TEAM_FORUM_ACCESS_NONE,
    TEAM_FORUM_ACCESS_OPTIONS,
    TEAM_MAX_ADMINS,
    TEAM_MAX_CREATED_PER_7_DAYS,
    TEAM_MAX_JOINED,
    TEAM_MAX_LEADERS,
    TEAM_PERMISSION_DEFINITIONS,
    TEAM_UPDATE_MAX_LENGTH,
    TEAM_UPDATE_MAX_PER_7_DAYS,
    add_team_leader,
    cancel_join_request,
    create_team,
    get_team,
    get_team_member,
    has_team_permission,
    join_or_request_team,
    kick_team_member,
    latest_team_update,
    process_join_request,
    quit_team,
    send_team_update,
    set_team_update_subscription,
    team_update_quota_remaining,
    team_updates_for_member,
    team_updates_for_user,
    teams_for_user,
    update_team,
    update_team_leader_permissions,
)
from typing_defs import ViewContext

from views import get_user_context


def _require_regular_user(user: Any) -> None:
    if user.anon:
        raise web.HTTPFound("/login")
    if user.bot:
        raise web.HTTPForbidden(text="BOT accounts cannot use teams.")


def _team_context(context: ViewContext) -> None:
    context["view_css"] = "team.css"
    context["title"] = "Teams • PyChess"


@aiohttp_jinja2.template("teams.html")
async def teams(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    _team_context(context)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    db = app_state.db

    cursor = (
        db.team.find({"enabled": True}).sort([("memberCount", -1), ("createdAt", -1)]).limit(60)
    )
    context["teams"] = await cursor.to_list(length=60)
    context["my_team_ids"] = set()
    if not user.anon and not user.bot:
        mine = await teams_for_user(app_state, user.username)
        context["my_team_ids"] = {str(team["_id"]) for team in mine}
    return context


@aiohttp_jinja2.template("teams.html")
async def my_teams(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    _team_context(context)
    mine = await teams_for_user(app_state, user.username)
    context["teams"] = mine
    context["my_team_ids"] = {str(team["_id"]) for team in mine}
    context["mine_only"] = True
    return context


@aiohttp_jinja2.template("team-new.html")
async def team_new(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    _team_context(context)
    context["team_max_joined"] = TEAM_MAX_JOINED
    context["team_max_created_per_7_days"] = TEAM_MAX_CREATED_PER_7_DAYS
    context["team_forum_access_options"] = TEAM_FORUM_ACCESS_OPTIONS
    context["team_forum_access_none"] = TEAM_FORUM_ACCESS_NONE
    return context


async def team_create(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    team = await create_team(get_app_state(request.app), user.username, data)
    raise web.HTTPFound(f"/team/{team['_id']}")


@aiohttp_jinja2.template("team-show.html")
async def team_show(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state = get_app_state(request.app)
    _team_context(context)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")
    db = app_state.db
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()

    member = (
        None if user.anon or user.bot else await get_team_member(app_state, team_id, user.username)
    )
    members = (
        await db.team_member.find({"team": team_id})
        .sort("joinedAt", 1)
        .limit(100)
        .to_list(length=100)
    )
    leaders = (
        await db.team_member.find({"team": team_id, "permissions": PERMISSION_PUBLIC})
        .sort("joinedAt", 1)
        .limit(TEAM_MAX_LEADERS)
        .to_list(length=TEAM_MAX_LEADERS)
    )
    requests: list[dict[str, Any]] = []
    declined_requests: list[dict[str, Any]] = []
    can_manage_requests = False
    can_kick = False
    can_edit = False
    can_create_tournament = False
    can_manage_leaders = False
    can_send_update = False
    if member is not None:
        permissions = set(member.get("permissions") or ())
        can_manage_requests = PERMISSION_REQUESTS in permissions
        can_kick = PERMISSION_KICK in permissions
        can_edit = PERMISSION_SETTINGS in permissions
        can_create_tournament = PERMISSION_TOURNAMENTS in permissions
        can_manage_leaders = PERMISSION_ADMIN in permissions
        can_send_update = PERMISSION_UPDATES in permissions
        if can_manage_requests:
            requests = (
                await db.team_request.find({"team": team_id, "declined": False})
                .sort("createdAt", 1)
                .limit(50)
                .to_list(length=50)
            )
            declined_requests = (
                await db.team_request.find({"team": team_id, "declined": True})
                .sort("processedAt", -1)
                .limit(50)
                .to_list(length=50)
            )

    pending_request = None
    if not user.anon and not user.bot and member is None:
        pending_request = await db.team_request.find_one(
            {"_id": f"{user.username}@{team_id}", "declined": False}
        )

    latest_update = await latest_team_update(app_state, team_id) if member is not None else None

    forum_categ = await ensure_team_forum(app_state, team)
    forum_categ_id = team_forum_categ_id(team_id)
    viewer_username = None if user.anon else user.username
    can_see_forum = forum_categ is not None and await can_read_forum_categ(
        app_state, forum_categ, viewer_username
    )
    forum_topics: list[dict[str, Any]] = []
    if can_see_forum:
        forum_topics = await (
            db.forum_topic.find({"categId": forum_categ_id})
            .sort([("sticky", -1), ("updatedAt", -1)])
            .limit(5)
            .to_list(length=5)
        )

    team_tournaments = (
        await db.tournament.find({"teamId": team_id})
        .sort("startsAt", -1)
        .limit(20)
        .to_list(length=20)
    )

    context.update(
        {
            "team": team,
            "team_member": member,
            "team_members": members,
            "team_leaders": leaders,
            "team_requests": requests,
            "team_declined_requests": declined_requests,
            "team_pending_request": pending_request,
            "team_can_manage_requests": can_manage_requests,
            "team_can_kick": can_kick,
            "team_can_edit": can_edit,
            "team_can_create_tournament": can_create_tournament,
            "team_can_manage_leaders": can_manage_leaders,
            "team_can_send_update": can_send_update,
            "team_latest_update": latest_update,
            "team_can_see_forum": can_see_forum,
            "team_forum_categ_id": forum_categ_id,
            "team_forum_topics": forum_topics,
            "team_public_permission": PERMISSION_PUBLIC,
            "team_tournaments": team_tournaments,
            "title": f"{team['name']} • PyChess",
        }
    )
    return context


async def team_join(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    await join_or_request_team(app_state, team, user.username, data)
    raise web.HTTPFound(f"/team/{team_id}")


async def team_cancel_request(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    team_id = request.match_info["teamId"]
    await cancel_join_request(get_app_state(request.app), team_id, user.username)
    raise web.HTTPFound(f"/team/{team_id}")


async def team_quit(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    team_id = request.match_info["teamId"]
    await quit_team(get_app_state(request.app), team_id, user.username)
    raise web.HTTPFound(f"/team/{team_id}")


@aiohttp_jinja2.template("team-edit.html")
async def team_edit(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()
    if not await has_team_permission(app_state, team_id, user.username, PERMISSION_SETTINGS):
        raise web.HTTPForbidden(text="You cannot edit this team.")
    _team_context(context)
    context["team"] = team
    context["team_forum_access_options"] = TEAM_FORUM_ACCESS_OPTIONS
    context["team_forum_access_none"] = TEAM_FORUM_ACCESS_NONE
    context["title"] = f"Edit {team['name']} • PyChess"
    return context


async def team_update(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    team_id = request.match_info["teamId"]
    await update_team(get_app_state(request.app), team_id, user.username, data)
    raise web.HTTPFound(f"/team/{team_id}")


async def team_request_process(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    team_id = request.match_info["teamId"]
    target = request.match_info["username"]
    decision = request.match_info["decision"]
    await process_join_request(get_app_state(request.app), team_id, user.username, target, decision)
    raise web.HTTPFound(f"/team/{team_id}")


async def team_kick(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    team_id = request.match_info["teamId"]
    target = request.match_info["username"]
    await kick_team_member(get_app_state(request.app), team_id, user.username, target)
    raise web.HTTPFound(f"/team/{team_id}")


@aiohttp_jinja2.template("team-updates.html")
async def team_updates(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    _team_context(context)
    context.update(
        {
            "team_updates": await team_updates_for_user(app_state, user.username),
            "updates_team": None,
            "team_updates_subscribed": True,
            "team_can_send_update": False,
            "title": "Team updates • PyChess",
        }
    )
    return context


@aiohttp_jinja2.template("team-updates.html")
async def team_updates_of(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()
    updates, subscribed = await team_updates_for_member(app_state, team_id, user.username)
    _team_context(context)
    context.update(
        {
            "team_updates": updates,
            "updates_team": team,
            "team_updates_subscribed": subscribed,
            "team_can_send_update": await has_team_permission(
                app_state, team_id, user.username, PERMISSION_UPDATES
            ),
            "title": f"{team['name']} updates • PyChess",
        }
    )
    return context


@aiohttp_jinja2.template("team-update-new.html")
async def team_update_new(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()
    if not await has_team_permission(app_state, team_id, user.username, PERMISSION_UPDATES):
        raise web.HTTPForbidden(text="You cannot send updates for this team.")
    _team_context(context)
    context.update(
        {
            "team": team,
            "team_update_max_length": TEAM_UPDATE_MAX_LENGTH,
            "team_update_max_per_7_days": TEAM_UPDATE_MAX_PER_7_DAYS,
            "team_update_quota_remaining": await team_update_quota_remaining(app_state, team_id),
            "title": f"New {team['name']} update • PyChess",
        }
    )
    return context


async def team_update_send(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    team_id = request.match_info["teamId"]
    await send_team_update(get_app_state(request.app), team_id, user.username, data.get("message"))
    raise web.HTTPFound(f"/team/{team_id}/updates")


async def team_update_subscribe(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    team_id = request.match_info["teamId"]
    subscribed = str(data.get("subscribe") or "").lower() in {"1", "true", "on"}
    await set_team_update_subscription(
        get_app_state(request.app), team_id, user.username, subscribed
    )
    raise web.HTTPFound(f"/team/{team_id}/updates")


@aiohttp_jinja2.template("team-leaders.html")
async def team_leaders(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    _require_regular_user(user)
    app_state = get_app_state(request.app)
    team_id = request.match_info["teamId"]
    team = await get_team(app_state, team_id)
    if team is None:
        raise web.HTTPNotFound()
    if not await has_team_permission(app_state, team_id, user.username, PERMISSION_ADMIN):
        raise web.HTTPForbidden(text="You cannot manage team leaders.")
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Teams require database access.")

    leaders = (
        await app_state.db.team_member.find({"team": team_id, "permissions.0": {"$exists": True}})
        .sort("joinedAt", 1)
        .limit(TEAM_MAX_LEADERS + 1)
        .to_list(length=TEAM_MAX_LEADERS + 1)
    )
    _team_context(context)
    context.update(
        {
            "team": team,
            "team_leaders": leaders,
            "team_permission_definitions": TEAM_PERMISSION_DEFINITIONS,
            "team_max_admins": TEAM_MAX_ADMINS,
            "team_max_leaders": TEAM_MAX_LEADERS,
            "title": f"{team['name']} leaders • PyChess",
        }
    )
    return context


async def team_leader_add(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    team_id = request.match_info["teamId"]
    await add_team_leader(
        get_app_state(request.app), team_id, user.username, str(data.get("username") or "")
    )
    raise web.HTTPFound(f"/team/{team_id}/leaders")


async def team_permissions_update(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    data = await read_post_data(request)
    if data is None:
        raise web.HTTPNoContent()
    getall = getattr(data, "getall", None)
    if not callable(getall):
        raise web.HTTPBadRequest(text="Invalid permissions form.")

    leader_names = [str(value) for value in getall("leader", [])]
    if not leader_names or len(set(leader_names)) != len(leader_names):
        raise web.HTTPBadRequest(text="Invalid leader list.")
    leaders = {
        username: {str(value) for value in getall(f"perm:{username}", [])}
        for username in leader_names
    }
    team_id = request.match_info["teamId"]
    app_state = get_app_state(request.app)
    await update_team_leader_permissions(app_state, team_id, user.username, leaders)
    if await has_team_permission(app_state, team_id, user.username, PERMISSION_ADMIN):
        raise web.HTTPFound(f"/team/{team_id}/leaders")
    raise web.HTTPFound(f"/team/{team_id}")
