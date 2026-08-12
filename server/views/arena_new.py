import aiohttp_jinja2
from aiohttp import web
from catalogued_variants import public_catalogued_variants_for_forms
from const import ARENA, T_CREATED
from pychess_global_app_state import PychessGlobalAppState
from settings import ADMINS
from tournament.tournaments import COMMUNITY_ARENA_MAX_CREATIONS_PER_24H
from tournament_director import is_tournament_director
from typedefs import pychess_global_app_state_key as app_state_key
from typing_defs import ViewContext
from variants import VARIANTS

from views import get_user_context


@aiohttp_jinja2.template("arena-new.html")
async def arena_new(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    app_state: PychessGlobalAppState = request.app[app_state_key]

    tournamentId = request.match_info.get("tournamentId")
    director = is_tournament_director(user, app_state)

    if user.anon or user.bot:
        raise web.HTTPForbidden(text="You must be logged in with a regular account.")

    tournament_variants = {
        key: variant for key, variant in VARIANTS.items() if not variant.two_boards
    }
    catalogued_variants = public_catalogued_variants_for_forms(app_state)
    favorite_names = user.catalogued_variant_favorites
    favorite_variants = {
        key: variant for key, variant in catalogued_variants.items() if key in favorite_names
    }
    community_variants = {
        key: variant for key, variant in catalogued_variants.items() if key not in favorite_names
    }
    context["variants"] = {**tournament_variants, **catalogued_variants}
    context["site_variants"] = tournament_variants
    context["favorite_variants"] = favorite_variants
    context["community_variants_for_tournaments"] = community_variants
    context["view_css"] = "arena-new.css"
    context["edit"] = tournamentId is not None
    context["admin"] = user.username in ADMINS
    context["tournament_director"] = director
    context["community_arena_max_creations_per_24h"] = COMMUNITY_ARENA_MAX_CREATIONS_PER_24H
    if tournamentId is None:
        context["rated"] = True
    else:
        tournament = app_state.tournaments.get(tournamentId)
        if tournament is None or user.username != tournament.creator:
            raise web.HTTPNotFound()
        if not director and (
            tournament.system != ARENA or tournament.frequency or tournament.status != T_CREATED
        ):
            raise web.HTTPForbidden(
                text="Regular users can only edit their own scheduled community Arena tournaments."
            )
        context["tournament"] = tournament

    return context
