import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import get_winners
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("shields.html")
async def shields(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    variant = request.match_info.get("variant")
    allowed_variants = None
    if user.game_category != "all":
        allowed_variants = user.category_variant_list

    if (variant is not None) and (variant not in VARIANTS):
        variant = None

    if allowed_variants is not None:
        if variant is None or variant not in allowed_variants:
            wi = await get_winners(app_state, shield=True, variants=allowed_variants)
        else:
            wi = await get_winners(app_state, shield=True, variant=variant)
    else:
        wi = await get_winners(app_state, shield=True, variant=variant)
    context["view_css"] = "players.css"
    context["users"] = app_state.users
    context["icons"] = VARIANT_ICONS
    context["winners"] = wi

    return context
