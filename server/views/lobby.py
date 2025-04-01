import json
from datetime import datetime

import aiohttp_jinja2

from views import get_user_context
from puzzle import get_daily_puzzle
from utils import corr_games, get_blogs


@aiohttp_jinja2.template("index.html")
async def lobby(request):
    user, context = await get_user_context(request)

    # Seek from Editor with custom start position
    variant = request.match_info.get("variant")
    fen = request.rel_url.query.get("fen")
    if fen is not None:
        context["variant"] = variant
        context["fen"] = fen.replace(".", "+").replace("_", " ")
        context["view_css"] = "lobby.css"

    context["title"] = "PyChess • Free Online Chess Variants"

    puzzle = await get_daily_puzzle(request)
    context["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

    c_games = corr_games(user.correspondence_games)
    context["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    blogs = await get_blogs(request, limit=3)
    context["blogs"] = json.dumps(blogs)
    return context
