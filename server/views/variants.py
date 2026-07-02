import os

from aiohttp import web
import aiohttp_jinja2

from lang import get_locale_ext
from typing_defs import ViewContext
from views import get_user_context
from variants import VARIANTS, VARIANT_ICONS
from catalogued_variants import (
    catalogued_variant_rule_context,
    catalogued_variants_for_client,
    find_catalogued_variant_doc,
)
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("variants.html")
async def variants(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    variant = request.match_info.get("variant")
    catalogued_doc = None
    if variant is not None and variant not in VARIANTS and variant != "terminology":
        catalogued_doc = await find_catalogued_variant_doc(app_state, variant)
        if catalogued_doc is None:
            variant = "chess"

    context["variants"] = user.category_variants
    context["groups"] = user.category_variant_groups
    context["catalogued_variant_links"] = catalogued_variants_for_client(app_state)

    context["icons"] = VARIANT_ICONS

    if catalogued_doc is not None:
        context["catalogued_variant"] = catalogued_variant_rule_context(catalogued_doc)
        context["title"] = f"{context['catalogued_variant']['displayName']} • PyChess"
        return context

    locale = get_locale_ext(context)

    # try translated docs file first
    if variant == "terminology":
        item = "docs/terminology%s.html" % locale
    else:
        item = "docs/" + ("terminology" if variant is None else variant) + "%s.html" % locale
    item_path = os.path.abspath(os.path.join("templates", item))

    # if there is no translated use the untranslated one
    if not os.path.exists(item_path):
        if variant == "terminology":
            item = "docs/terminology.html"
        else:
            item = "docs/" + ("terminology" if variant is None else variant) + ".html"
        item_path = os.path.abspath(os.path.join("templates", item))

    if not os.path.exists(item_path):
        raise web.HTTPNotFound()
    context["variant"] = item

    return context
