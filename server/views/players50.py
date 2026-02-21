import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import VARIANTS


@aiohttp_jinja2.template("players50.html")
async def players50(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    variant = request.match_info.get("variant")

    if variant not in VARIANTS or variant not in app_state.highscore:
        raise web.HTTPNotFound()

    context["variant"] = variant
    context["highscore"] = app_state.highscore[variant]
    context["view"] = "players50"

    return context
