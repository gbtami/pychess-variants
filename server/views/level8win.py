import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("profile.html")
async def level8win(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    context["view_css"] = "profile.css"
    context["profile"] = "Fairy-Stockfish"
    context["level"] = 8

    return context
