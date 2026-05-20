from __future__ import annotations

import aiohttp_jinja2
from aiohttp import web

from const import TStatus
from settings import ADMINS
from typing_defs import ViewContext
from views import get_user_context


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _tournament_status_label(status: object) -> str:
    if isinstance(status, str):
        return status.removeprefix("T_").replace("_", " ").title()

    try:
        return TStatus(int(status)).name.removeprefix("T_").replace("_", " ").title()
    except (TypeError, ValueError):
        return str(status)


@aiohttp_jinja2.template("mod_public_chat.html")
async def mod_public_chat(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if not _is_admin_username(user.username):
        raise web.HTTPForbidden()

    app_state = user.app_state

    lobby_lines = [
        line for line in app_state.lobby.lobbychat if str(line.get("user") or "").strip()
    ]

    tournaments: list[dict[str, object]] = []
    for tournament in app_state.tournaments.values():
        lines = [line for line in tournament.tourneychat if str(line.get("user") or "").strip()]
        if not lines:
            continue
        tournaments.append(
            {
                "id": tournament.id,
                "name": tournament.name,
                "status": _tournament_status_label(
                    getattr(tournament, "status", getattr(tournament, "status_name", ""))
                ),
                "lines": lines,
            }
        )

    tournaments.sort(key=lambda item: str(item["name"]).lower())

    round_games: list[dict[str, object]] = []
    for game in app_state.games.values():
        lines = [line for line in game.messages if str(line.get("user") or "").strip()]
        if not lines:
            continue
        round_games.append(
            {
                "id": game.id,
                "white": game.wplayer.username,
                "black": game.bplayer.username,
                "variant": game.variant,
                "lines": lines,
            }
        )

    round_games.sort(key=lambda item: str(item["id"]))

    context["title"] = "Public Chats • PyChess"
    context["view"] = "mod_public_chat"
    context["view_css"] = "mod_public_chat.css"
    context["admin"] = True
    context["lobby_lines"] = lobby_lines
    context["round_games"] = round_games
    context["tournaments"] = tournaments
    return context
