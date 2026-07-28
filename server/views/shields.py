import aiohttp_jinja2
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import get_winners
from typing_defs import ViewContext
from variants import VARIANT_ICONS, VARIANTS

from views import get_user_context


@aiohttp_jinja2.template("shields.html")
async def shields(request: web.Request) -> ViewContext:
    _user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    variant = request.match_info.get("variant")
    allowed_variants = None
    if context["game_category"] != "all":
        allowed_variants = context["category_variant_list"]

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
    context["icons"] = VARIANT_ICONS
    context["winners"] = wi

    return context
