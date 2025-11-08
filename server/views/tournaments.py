from aiohttp import web
import aiohttp_jinja2

from const import TRANSLATED_PAIRING_SYSTEM_NAMES, T_CREATED
from misc import time_control_str
from settings import TOURNAMENT_DIRECTORS
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from tournament.tournaments import (
    create_or_update_tournament,
    get_latest_tournaments,
)
from variants import VARIANT_ICONS


@aiohttp_jinja2.template("tournaments.html")
async def tournaments(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    if user.username in TOURNAMENT_DIRECTORS:
        if request.path.endswith("/arena"):
            data = await request.post()
            await create_or_update_tournament(app_state, user.username, data)

        elif request.path.endswith("/edit"):
            data = await request.post()

            tournamentId = request.match_info.get("tournamentId")
            tournament = app_state.tournaments.get(tournamentId) if tournamentId else None

            if tournament is None and tournamentId is not None:
                raise web.HTTPNotFound()
            if tournament and user.username != tournament.creator:
                raise web.HTTPForbidden()
            if tournament and tournament.status != T_CREATED:
                raise web.HTTPForbidden()
            print("EDIT", data)
            await create_or_update_tournament(app_state, user.username, data, tournament)

    lang = context["lang"]
    gettext = app_state.translations[lang].gettext

    def pairing_system_name(system):
        return gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system])

    context["icons"] = VARIANT_ICONS
    context["pairing_system_name"] = pairing_system_name
    context["time_control_str"] = time_control_str
    context["tables"] = await get_latest_tournaments(app_state, lang)
    context["td"] = user.username in TOURNAMENT_DIRECTORS

    return context
