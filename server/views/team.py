from __future__ import annotations

from typing import Any

import aiohttp_jinja2
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from team import (
    PERMISSION_KICK,
    PERMISSION_REQUESTS,
    PERMISSION_SETTINGS,
    TEAM_MAX_CREATED_PER_7_DAYS,
    TEAM_MAX_JOINED,
    cancel_join_request,
    create_team,
    get_team,
    get_team_member,
    has_team_permission,
    join_or_request_team,
    kick_team_member,
    process_join_request,
    quit_team,
    teams_for_user,
    update_team,
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
        db.team.find({"enabled": True})
        .sort([("memberCount", -1), ("createdAt", -1)])
        .limit(60)
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
        None
        if user.anon or user.bot
        else await get_team_member(app_state, team_id, user.username)
    )
    members = (
        await db.team_member.find({"team": team_id})
        .sort("joinedAt", 1)
        .limit(100)
        .to_list(length=100)
    )
    leaders = [item for item in members if item.get("permissions")]
    requests: list[dict[str, Any]] = []
    declined_requests: list[dict[str, Any]] = []
    can_manage_requests = False
    can_kick = False
    can_edit = False
    if member is not None:
        permissions = set(member.get("permissions") or ())
        can_manage_requests = PERMISSION_REQUESTS in permissions
        can_kick = PERMISSION_KICK in permissions
        can_edit = PERMISSION_SETTINGS in permissions
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
    await process_join_request(
        get_app_state(request.app), team_id, user.username, target, decision
    )
    raise web.HTTPFound(f"/team/{team_id}")


async def team_kick(request: web.Request) -> web.StreamResponse:
    user, _ = await get_user_context(request)
    _require_regular_user(user)
    team_id = request.match_info["teamId"]
    target = request.match_info["username"]
    await kick_team_member(get_app_state(request.app), team_id, user.username, target)
    raise web.HTTPFound(f"/team/{team_id}")
