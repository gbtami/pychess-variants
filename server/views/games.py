import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context
from variants import VARIANT_ICONS


@aiohttp_jinja2.template("games.html")
async def games(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")

    context["variant"] = variant if variant is not None else ""
    context["variants"] = user.category_variants
    context["groups"] = user.category_variant_groups

    context["icons"] = VARIANT_ICONS

    return context
