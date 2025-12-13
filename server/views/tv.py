import json

import aiohttp_jinja2
from aiohttp import web

from views import add_game_context, get_user_context
from utils import tv_game, tv_game_user, load_game
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("index.html")
async def tv(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    profileId = request.match_info.get("profileId")

    if profileId is not None:
        gameId = await tv_game_user(app_state.db, app_state.users, profileId)
    else:
        gameId = await tv_game(app_state)

    ply = request.rel_url.query.get("ply")

    game = await load_game(app_state, gameId)
    if game is None:
        raise web.HTTPNotFound()

    add_game_context(game, ply, user, context)

    if not game.is_player(user):
        game.spectators.add(user)

    context["ct"] = json.dumps(game.crosstable)

    context["view"] = "tv"
    context["view_css"] = "round.css"
    context["gameId"] = gameId
    context["profile"] = profileId

    return context
