import aiohttp_jinja2
from aiohttp import web

from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def inbox(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/")

    contact = request.match_info.get("contact")
    if contact:
        context["profile"] = contact

    context["title"] = "Inbox • PyChess"
    context["view"] = "inbox"
    context["view_css"] = "inbox.css"
    return context
