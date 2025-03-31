import aiohttp_jinja2

from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import VARIANTS


@aiohttp_jinja2.template("players50.html")
async def players50(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    variant = request.match_info.get("variant")
    context["variant"] = variant

    if variant in VARIANTS:
        hs = app_state.highscore[variant]
        context["highscore"] = hs
        context["view"] = "players50"

    return context
