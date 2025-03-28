import aiohttp_jinja2

from const import VARIANT_GROUPS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from variants import ALL_VARIANTS, VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("games.html")
async def games(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    variant = request.match_info.get("variant")

    context["variant"] = variant if variant is not None else ""
    context["variants"] = VARIANTS
    context["icons"] = VARIANT_ICONS
    context["groups"] = VARIANT_GROUPS

    lang = context["lang"]

    def variant_display_name(variant):
        return app_state.translations[lang].gettext(ALL_VARIANTS[variant].translated_name)

    context["variant_display_name"] = variant_display_name

    return context
