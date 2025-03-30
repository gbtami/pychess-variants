import aiohttp_jinja2

from const import TRANSLATED_PAIRING_SYSTEM_NAMES
from misc import time_control_str
from settings import TOURNAMENT_DIRECTORS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import (
    create_or_update_tournament,
    get_latest_tournaments,
)
from variants import ALL_VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("tournaments.html")
async def tournaments(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    if user.username in TOURNAMENT_DIRECTORS:
        if request.path.endswith("/arena"):
            data = await request.post()
            await create_or_update_tournament(app_state, user.username, data)

    lang = context["lang"]

    def pairing_system_name(system):
        return app_state.translations[lang].gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system])

    def variant_display_name(variant):
        return app_state.translations[lang].gettext(ALL_VARIANTS[variant].translated_name)

    context["icons"] = VARIANT_ICONS
    context["variant_display_name"] = variant_display_name
    context["pairing_system_name"] = pairing_system_name
    context["time_control_str"] = time_control_str
    context["tables"] = await get_latest_tournaments(app_state, lang)
    context["td"] = user.username in TOURNAMENT_DIRECTORS

    return context
