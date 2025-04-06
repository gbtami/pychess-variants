import aiohttp_jinja2
from views import get_user_context
from utils import tv_game, tv_game_user
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

    context["view"] = "tv"
    context["view_css"] = "round"
    context["gameId"] = gameId

    return context
