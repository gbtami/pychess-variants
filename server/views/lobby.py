import json
from datetime import datetime

import aiohttp_jinja2
from aiohttp import web
import aiohttp_session

from views import get_user_context
from puzzle import get_daily_puzzle
from settings import TOURNAMENT_DIRECTORS
from utils import corr_games, get_blogs
from variants import VARIANTS


@aiohttp_jinja2.template("index.html")
async def lobby(request):
    user, context = await get_user_context(request)

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
    if (variant is not None) and (variant not in VARIANTS):
        variant = "chess"

    fen = request.rel_url.query.get("fen")

    if fen is not None:
        context["variant"] = variant
        context["fen"] = fen.replace(".", "+").replace("_", " ")
        context["view_css"] = "lobby.css"

    # Challenge user from user's profile or FSF from Editor
    profileId = request.match_info.get("profileId")

    # Play menu (Create a game)
    if request.rel_url.query.get("any") is not None:
        profileId = "any#"
        context["profile"] = profileId

    if "/challenge" in request.path:
        if user.anon and profileId != "Fairy-Stockfish":
            raise web.HTTPNotFound()
        else:
            context["profile"] = profileId
            context["view_css"] = "lobby.css"

    context["title"] = "PyChess • Free Online Chess Variants"
    context["tournamentdirector"] = user.username in TOURNAMENT_DIRECTORS

    puzzle = await get_daily_puzzle(request)
    context["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

    c_games = corr_games(user.correspondence_games)
    context["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    blogs = await get_blogs(request, limit=3)
    context["blogs"] = json.dumps(blogs)
    return context
