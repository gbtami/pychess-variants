import aiohttp_jinja2

from const import CATEGORIES, VARIANT_GROUPS
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("games.html")
async def games(request):
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")

    context["variant"] = variant if variant is not None else ""
    if user.game_category == "all":
        context["variants"] = VARIANTS
        context["groups"] = VARIANT_GROUPS
    else:
        context["variants"] = {
            v: VARIANTS[v] for v in CATEGORIES[user.game_category] if v in VARIANTS
        }
        context["groups"] = {v: g for v, g in VARIANT_GROUPS.items() if g == user.game_category}

    context["icons"] = VARIANT_ICONS

    return context
