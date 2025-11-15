import aiohttp_jinja2
from aiohttp import web

from pychess_global_app_state import PychessGlobalAppState
from settings import ADMINS, TOURNAMENT_DIRECTORS
from typedefs import pychess_global_app_state_key as app_state_key
from views import get_user_context
from variants import VARIANTS


@aiohttp_jinja2.template("arena-new.html")
async def arena_new(request):
    user, context = await get_user_context(request)
    app_state: PychessGlobalAppState = request.app[app_state_key]

    tournamentId = request.match_info.get("tournamentId")

    if user.username not in TOURNAMENT_DIRECTORS:
        raise web.HTTPForbidden()

    context["variants"] = VARIANTS
    context["view_css"] = "arena-new.css"
    context["edit"] = tournamentId is not None
    context["admin"] = user.username in ADMINS
    if tournamentId is None:
        context["rated"] = True
    else:
        tournament = app_state.tournaments.get(tournamentId)
        if tournament is None or user.username != tournament.creator:
            raise web.HTTPNotFound()
        context["tournament"] = tournament

    return context
