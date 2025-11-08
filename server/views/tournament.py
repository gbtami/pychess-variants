import aiohttp_jinja2

from const import T_CREATED
from settings import TOURNAMENT_DIRECTORS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import (
    load_tournament,
    get_tournament_name,
)


@aiohttp_jinja2.template("index.html")
async def tournament(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    tournamentId = request.match_info.get("tournamentId")
    tournament = await load_tournament(app_state, tournamentId)

    if tournament is None:
        return context  # web.HTTPFound("/")

    if user.username in TOURNAMENT_DIRECTORS and tournament.status == T_CREATED:
        if request.path.endswith("/cancel"):
            await tournament.abort()
            return context  # web.HTTPFound("/tournaments")

    if request.path.endswith("/pause") and user in tournament.players:
        await tournament.pause(user)

    tournament_name = await get_tournament_name(request, tournamentId)
    context["tournamentid"] = tournamentId
    context["tournamentname"] = tournament_name
    context["tournamentcreator"] = tournament.creator
    context["description"] = tournament.description
    context["variant"] = tournament.variant
    context["chess960"] = tournament.chess960
    context["rated"] = tournament.rated
    context["base"] = tournament.base
    context["inc"] = tournament.inc
    context["byo"] = tournament.byoyomi_period
    context["fen"] = tournament.fen
    context["before_start"] = tournament.before_start
    context["minutes"] = tournament.minutes
    context["date"] = tournament.starts_at
    context["rounds"] = tournament.rounds
    context["frequency"] = tournament.frequency
    context["status"] = tournament.status
    context["title"] = tournament.browser_title

    return context
