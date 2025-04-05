import json

import aiohttp_jinja2
from aiohttp import web

from fairy import FairyBoard
from utils import load_game
from variants import VARIANTS
from views import add_game_context, get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("analysis.html")
async def analysis(request):
    user, context = await get_user_context(request)

    gameId = request.match_info.get("gameId")
    variant = request.match_info.get("variant")
    ply = request.rel_url.query.get("ply")
    if (variant is not None) and (variant not in VARIANTS):
        variant = "chess"

    if gameId is None:
        fen = request.rel_url.query.get("fen")
        if fen is None:
            fen = FairyBoard.start_fen(variant)
        else:
            fen = fen.replace(".", "+").replace("_", " ")
        context["fen"] = fen
        context["variant"] = variant if variant is not None else ""
    else:
        app_state = get_app_state(request.app)
        game = await load_game(app_state, gameId)
        if game is None:
            raise web.HTTPNotFound()

        add_game_context(game, ply, user, context)

        context["view"] = "analysis"
        context["view_css"] = "analysis.css"

        if not request.path.startswith("/corr"):
            context["ct"] = json.dumps(game.crosstable)

    return context
