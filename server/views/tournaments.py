import asyncio
from typing import TYPE_CHECKING

from aiohttp import web
import aiohttp_jinja2

from const import TRANSLATED_PAIRING_SYSTEM_NAMES
from misc import time_control_str
from typing_defs import ViewContext
from views import get_user_context
from pychess_global_app_state_utils import get_app_state
from request_utils import read_post_data
from tournament_director import is_tournament_director
from tournament.tournaments import (
    create_or_update_tournament,
    get_latest_tournaments,
)
from variants import VARIANT_ICONS
import logging

log = logging.getLogger(__name__)


@aiohttp_jinja2.template("tournaments.html")
async def tournaments(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    director = is_tournament_director(user, app_state)

    if director:
        if request.path.endswith("/new"):
            data = await read_post_data(request)
            if data is None:
                raise web.HTTPNoContent()
            await create_or_update_tournament(app_state, user.username, data)

        elif request.path.endswith("/edit"):
            data = await read_post_data(request)
            if data is None:
                raise web.HTTPNoContent()

            tournamentId = request.match_info.get("tournamentId")
            tournament = app_state.tournaments.get(tournamentId) if tournamentId else None

            if tournament is None and tournamentId is not None:
                raise web.HTTPNotFound(text="Tournament not found.")
            if tournament and user.username != tournament.creator:
                raise web.HTTPForbidden(
                    text="Only the tournament creator can edit this tournament."
                )

            if TYPE_CHECKING:
                assert tournament is not None
            task = tournament.clock_task
            if task is not None:
                taskname = task.get_name()
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    log.debug("%s cancelled" % taskname)
                    tournament.clock_task = None

            await create_or_update_tournament(app_state, user.username, data, tournament)

    lang = context["lang"]
    gettext = app_state.translations[lang].gettext

    def pairing_system_name(system: int) -> str:
        return gettext(TRANSLATED_PAIRING_SYSTEM_NAMES[system])

    context["icons"] = VARIANT_ICONS
    context["pairing_system_name"] = pairing_system_name
    context["time_control_str"] = time_control_str
    tables = await get_latest_tournaments(app_state, lang)
    if user.game_category != "all":
        allowed_variants = user.category_variant_set
        started, scheduled, completed = tables
        started = [
            t for t in started if (t.variant + ("960" if t.chess960 else "")) in allowed_variants
        ]
        scheduled = [
            t for t in scheduled if (t.variant + ("960" if t.chess960 else "")) in allowed_variants
        ]
        completed = [
            t for t in completed if (t.variant + ("960" if t.chess960 else "")) in allowed_variants
        ]
        tables = (started, scheduled, completed)
    context["tables"] = tables
    context["td"] = director

    return context
