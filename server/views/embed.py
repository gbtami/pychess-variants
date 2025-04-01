import json

import aiohttp_jinja2
from aiohttp import web

from const import DARK_FEN
from fairy import BLACK, WHITE
from utils import load_game
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("embed.html")
async def embed(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    # play or analyze game
    gameId = request.match_info.get("gameId")
    ply = request.rel_url.query.get("ply")

    game = await load_game(app_state, gameId)
    if game is None:
        raise web.HTTPNotFound()

    context["view_css"] = "embed.css"

    context["gameid"] = gameId
    context["variant"] = game.variant
    context["wplayer"] = game.wplayer.username
    context["wtitle"] = game.wplayer.title
    context["wrating"] = game.wrating
    context["wrdiff"] = game.wrdiff
    context["chess960"] = game.chess960
    context["rated"] = game.rated
    context["corr"] = game.corr
    context["level"] = game.level
    context["bplayer"] = game.bplayer.username
    context["btitle"] = game.bplayer.title
    context["brating"] = game.brating
    context["brdiff"] = game.brdiff
    context["fen"] = DARK_FEN if game.variant == "fogofwar" else game.fen
    context["base"] = game.base
    context["inc"] = game.inc
    context["byo"] = game.byoyomi_period
    context["result"] = game.result
    context["status"] = game.status
    context["date"] = game.date.isoformat()
    context["title"] = game.browser_title
    # todo: I think sent ply value shouldn't be minus 1.
    #       But also it gets overwritten anyway right after that so why send all this stuff at all here.
    #       just init client on 1st ws board msg received right after ws connection is established
    context["ply"] = ply if ply is not None else game.ply - 1
    context["initialFen"] = game.initial_fen

    user_color = WHITE if user == game.wplayer else BLACK if user == game.bplayer else None
    context["board"] = json.dumps(game.get_board(full=True, persp_color=user_color))

    return context
