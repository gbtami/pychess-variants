import json
from datetime import datetime

import aiohttp_jinja2

from views import get_user_context
from puzzle import get_daily_puzzle
from utils import corr_games, get_blogs


@aiohttp_jinja2.template("index.html")
async def lobby(request):
    user, context = await get_user_context(request)

    context["title"] = "PyChess • Free Online Chess Variants"

    puzzle = await get_daily_puzzle(request)
    print("PUZZLE", puzzle)
    context["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

    c_games = corr_games(user.correspondence_games)
    context["corr_games"] = json.dumps(c_games, default=datetime.isoformat)

    blogs = await get_blogs(request, limit=3)
    context["blogs"] = json.dumps(blogs)
    return context
