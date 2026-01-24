from aiohttp import web

from typing_defs import ViewContext
from views.analysis import analysis
from views.round_view import round_view


async def game(request: web.Request) -> ViewContext:
    ply = request.rel_url.query.get("ply")
    if ply is not None:
        response = await analysis(request)
    else:
        response = await round_view(request)
    return response
