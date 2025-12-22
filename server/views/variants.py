import os

import aiohttp_jinja2

from const import CATEGORIES, VARIANT_GROUPS
from lang import get_locale_ext
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("variants.html")
async def variants(request):
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")
    if (variant is not None) and ((variant not in VARIANTS) and variant != "terminology"):
        variant = "chess"

    if user.game_category == "all":
        context["variants"] = VARIANTS
        context["groups"] = VARIANT_GROUPS
    else:
        context["variants"] = {
            v: VARIANTS[v] for v in CATEGORIES[user.game_category] if v in VARIANTS
        }
        context["groups"] = {
            v: g for v, g in VARIANT_GROUPS.items() if g == user.game_category
        }

    context["icons"] = VARIANT_ICONS
    locale = get_locale_ext(context)

    # try translated docs file first
    if variant == "terminology":
        item = "docs/terminology%s.html" % locale
    else:
        item = "docs/" + ("terminology" if variant is None else variant) + "%s.html" % locale

    # if there is no translated use the untranslated one
    if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
        if variant == "terminology":
            item = "docs/terminology.html"
        else:
            item = "docs/" + ("terminology" if variant is None else variant) + ".html"
    context["variant"] = item

    return context
