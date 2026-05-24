import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def forum(request: web.Request) -> ViewContext:
    """Render the SPA entry point for all forum routes."""
    _user, context = await get_user_context(request)
    context["title"] = "Forum • PyChess"
    context["view"] = "forum"
    context["view_css"] = "forum.css"
    return context
