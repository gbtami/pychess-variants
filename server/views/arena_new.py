import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from settings import ADMINS, TOURNAMENT_DIRECTORS
from views import get_user_context
from variants import ALL_VARIANTS, VARIANTS


@aiohttp_jinja2.template("arena-new.html")
async def arena_new(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    tournamentId = request.match_info.get("tournamentId")

    if user.username not in TOURNAMENT_DIRECTORS:
        raise web.HTTPNotFound()

    lang = context["lang"]

    def variant_display_name(variant):
        return app_state.translations[lang].gettext(ALL_VARIANTS[variant].translated_name)

    context["variants"] = VARIANTS
    context["variant_display_name"] = variant_display_name
    context["view_css"] = "arena-new.css"
    context["edit"] = tournamentId is not None
    context["admin"] = user.username in ADMINS
    if tournamentId is None:
        context["rated"] = True

    return context
