import aiohttp_jinja2

from const import VARIANT_GROUPS
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("games.html")
async def games(request):
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")

    context["variant"] = variant if variant is not None else ""
    context["variants"] = VARIANTS
    context["icons"] = VARIANT_ICONS
    context["groups"] = VARIANT_GROUPS

    return context
