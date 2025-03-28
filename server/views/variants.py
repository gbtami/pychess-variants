import os

import aiohttp_jinja2

from const import VARIANT_GROUPS
from views import get_locale_ext, get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import ALL_VARIANTS, VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("variants.html")
async def variants(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    variant = request.match_info.get("variant")

    context["variants"] = VARIANTS
    context["icons"] = VARIANT_ICONS
    context["groups"] = VARIANT_GROUPS

    lang = context["lang"]
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

    def variant_display_name(variant):
        return app_state.translations[lang].gettext(ALL_VARIANTS[variant].translated_name)

    context["variant_display_name"] = variant_display_name

    return context
