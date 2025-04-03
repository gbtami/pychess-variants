import aiohttp_jinja2
from aiohttp import web

from utils import load_game
from views import add_game_context, get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("embed.html")
async def embed(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    gameId = request.match_info.get("gameId")
    ply = request.rel_url.query.get("ply")

    game = await load_game(app_state, gameId)
    if game is None:
        raise web.HTTPNotFound()

    add_game_context(game, ply, user, context)

    context["view_css"] = "embed.css"

    return context
