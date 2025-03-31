import aiohttp_jinja2
from aiohttp import web

from settings import ADMINS, TOURNAMENT_DIRECTORS
from views import get_user_context
from variants import VARIANTS


@aiohttp_jinja2.template("arena-new.html")
async def arena_new(request):
    user, context = await get_user_context(request)

    tournamentId = request.match_info.get("tournamentId")

    if user.username not in TOURNAMENT_DIRECTORS:
        raise web.HTTPNotFound()

    context["variants"] = VARIANTS
    context["view_css"] = "arena-new.css"
    context["edit"] = tournamentId is not None
    context["admin"] = user.username in ADMINS
    if tournamentId is None:
        context["rated"] = True

    return context
