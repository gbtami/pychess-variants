import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def about(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    return context
