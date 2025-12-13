import json
from datetime import datetime

import aiohttp_jinja2
from aiohttp import web

from puzzle import (
    get_puzzle,
    next_puzzle,
    get_daily_puzzle,
    default_puzzle_perf,
)
from views import get_user_context
from variants import VARIANTS


@aiohttp_jinja2.template("analysis.html")
async def puzzle(request):
    user, context = await get_user_context(request)

    variant = request.match_info.get("variant")

    if request.path.endswith("/daily"):
        puzzle = await get_daily_puzzle(request)
    else:
        puzzleId = request.match_info.get("puzzleId")

        if puzzleId in VARIANTS:
            user.puzzle_variant = puzzleId
            puzzleId = None
        elif variant in VARIANTS:
            user.puzzle_variant = variant
        else:
            user.puzzle_variant = None

        if puzzleId is None:
            puzzle = await next_puzzle(request, user)
        else:
            puzzle = await get_puzzle(request, puzzleId)
            if puzzle is None:
                raise web.HTTPNotFound()

    color = puzzle["f"].split()[1]
    chess960 = False
    dafault_perf = default_puzzle_perf(puzzle["e"])
    puzzle_rating = int(round(puzzle.get("perf", dafault_perf)["gl"]["r"], 0))
    variant = puzzle["v"]
    if color == "w":
        wrating = int(round(user.get_puzzle_rating(variant, chess960).mu, 0))
        brating = puzzle_rating
    else:
        brating = int(round(user.get_puzzle_rating(variant, chess960).mu, 0))
        wrating = puzzle_rating

    context["view_css"] = "analysis.css"
    context["variant"] = variant
    context["fen"] = puzzle["f"]
    context["wrating"] = wrating
    context["brating"] = brating
    context["puzzle"] = json.dumps(puzzle, default=datetime.isoformat)

    return context
