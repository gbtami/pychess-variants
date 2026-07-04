import json

import aiohttp_jinja2
from aiohttp import web
import aiohttp_session

from json_utils import json_dumps
from views import get_user_context
from puzzle import get_daily_puzzle
from pychess_global_app_state_utils import get_app_state
from tournament_director import is_tournament_director
from typing_defs import ViewContext
from utils import corr_games, get_blogs
from variants import ALL_VARIANTS, is_catalogued_variant
from catalogued_variants import catalogued_variant_client_doc_for_name


@aiohttp_jinja2.template("index.html")
async def lobby(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    # If OAuth data exists in session after oauth login, we need a new username
    session = await aiohttp_session.get_session(request)
    context["oauth_username_selection"] = (
        {
            "oauth_id": session.get("oauth_id"),
            "oauth_provider": session.get("oauth_provider"),
            "oauth_username": session.get("oauth_username"),
        }
        if session.get("oauth_id")
        else None
    )

    # Seek from Editor with custom start position
    variant = request.match_info.get("variant")
    if (variant is not None) and (variant not in ALL_VARIANTS):
        variant = "chess"

    fen = request.rel_url.query.get("fen")
    selected_variant = request.rel_url.query.get("variant")
    if selected_variant is not None and selected_variant in ALL_VARIANTS:
        catalogued_doc = None
        if is_catalogued_variant(selected_variant):
            catalogued_doc = catalogued_variant_client_doc_for_name(
                app_state, selected_variant, user.username if not user.anon else None
            )
            if catalogued_doc is not None:
                catalogued_variants = json.loads(str(context.get("catalogued_variants") or "[]"))
                if not any(item.get("name") == selected_variant for item in catalogued_variants):
                    catalogued_variants.append(catalogued_doc)
                    context["catalogued_variants"] = json_dumps(catalogued_variants)
        if catalogued_doc is not None or not is_catalogued_variant(selected_variant):
            context["variant"] = selected_variant

    if fen is not None:
        context["variant"] = variant
        context["fen"] = fen.replace(".", "+").replace("_", " ")
        context["view_css"] = "lobby.css"

    # Challenge user from user's profile or FSF from Editor
    profileId = request.match_info.get("profileId")

    # Play menu (Create a game)
    if request.rel_url.query.get("any") is not None:
        profileId = "any#"

    # Direct AI entry point used by custom/catalogued variant pages.  Keep it
    # query based so ?variant=... can preload unlisted catalogued variants too.
    if request.rel_url.query.get("ai") is not None:
        profileId = "Fairy-Stockfish"

    opens_lobby_dialog = profileId is not None and (
        "/challenge" in request.path
        or "/play" in request.path
        or request.rel_url.query.get("any") is not None
        or request.rel_url.query.get("ai") is not None
    )
    if opens_lobby_dialog:
        context["profile"] = profileId
        context["profile_title"] = (
            app_state.users[profileId].title
            if isinstance(profileId, str) and profileId in app_state.users
            else ""
        )
        context["view_css"] = "lobby.css"
        if user.anon and context["profile_title"] != "BOT" and profileId != "any#":
            raise web.HTTPNotFound()

    context["title"] = "PyChess • Free Online Chess Variants"
    context["tournamentdirector"] = is_tournament_director(user, app_state)

    puzzle = await get_daily_puzzle(request)
    context["puzzle"] = json_dumps(puzzle)

    c_games = corr_games(user.correspondence_games)
    context["corr_games"] = json_dumps(c_games)

    blogs = await get_blogs(request, limit=3)
    context["blogs"] = json_dumps(blogs)
    return context
