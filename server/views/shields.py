import aiohttp_jinja2

from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import get_winners
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("shields.html")
async def shields(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    variant = request.match_info.get("variant")
    if (variant is not None) and (variant not in VARIANTS):
        variant = "chess"

    wi = await get_winners(app_state, shield=True, variant=variant)
    context["view_css"] = "players.css"
    context["users"] = app_state.users
    context["icons"] = VARIANT_ICONS
    context["winners"] = wi

    return context
