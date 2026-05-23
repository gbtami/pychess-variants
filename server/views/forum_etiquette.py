import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("forum_etiquette.html")
async def forum_etiquette(request: web.Request) -> ViewContext:
    """Render the forum etiquette page."""
    _user, context = await get_user_context(request)

    context["title"] = "Forum Etiquette • PyChess"
    context["view"] = "faq"
    context["view_css"] = "faq.css"
    return context
