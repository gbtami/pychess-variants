import aiohttp_jinja2
from aiohttp import web
from friendly_sites import public_friendly_sites
from typing_defs import ViewContext

from views import get_user_context


@aiohttp_jinja2.template("friendly_sites.html")
async def friendly_sites(request: web.Request) -> ViewContext:
    _user, context = await get_user_context(request)
    context["friendly_sites"] = public_friendly_sites()
    context["title"] = "Friendly sites • PyChess"
    return context
