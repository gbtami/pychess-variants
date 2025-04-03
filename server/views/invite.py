import json

import aiohttp_jinja2
from aiohttp import web

from logger import log
from utils import join_seek
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("index.html")
async def invite(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    gameId = request.match_info.get("gameId")
    if (gameId in app_state.games) or (gameId not in app_state.invites):
        raise web.HTTPNotFound()

    seek_id = app_state.invites[gameId].id
    seek = app_state.seeks[seek_id]

    player = request.match_info.get("player")
    seek_status = await join_seek(app_state, user, seek, gameId, join_as=player)

    if seek_status["type"] == "seek_joined":
        inviter = "wait"
    elif seek_status["type"] == "seek_occupied":
        inviter = "occupied"
    elif seek_status["type"] == "seek_yourself":
        inviter = "yourself"
    elif seek_status["type"] == "new_game":
        try:
            # Put response data to sse subscribers queue
            channels = app_state.invite_channels
            for queue in channels:
                await queue.put(json.dumps({"gameId": gameId}))
            # return games[game_id]
        except ConnectionResetError:
            log.error("/invite/accept/ ConnectionResetError for user %s", user.username)

    context["view"] = "invite"
    context["view_css"] = "round.css"

    context["gameid"] = gameId
    context["variant"] = seek.variant
    context["chess960"] = seek.chess960
    context["rated"] = seek.rated
    context["corr"] = seek.day > 0
    context["base"] = seek.base
    context["inc"] = seek.inc
    context["byo"] = seek.byoyomi_period
    context["inviter"] = inviter
    context["seekempty"] = seek.player1 is None and seek.player2 is None

    return context
