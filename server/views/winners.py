import aiohttp_jinja2

from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import get_winners
from const import CATEGORIES
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("winners.html")
async def winners(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    variant = request.match_info.get("variant")
    allowed_variants = None
    if user.game_category != "all":
        allowed_variants = [v for v in CATEGORIES[user.game_category] if v in VARIANTS]

    if (variant is not None) and (variant not in VARIANTS):
        variant = None

    if allowed_variants is not None:
        if variant is None or variant not in allowed_variants:
            wi = await get_winners(app_state, shield=False, variants=allowed_variants)
        else:
            wi = await get_winners(app_state, shield=False, variant=variant)
    else:
        wi = await get_winners(app_state, shield=False, variant=variant)
    context["view_css"] = "players.css"
    context["users"] = app_state.users
    context["icons"] = VARIANT_ICONS
    context["winners"] = wi

    return context
