import aiohttp_jinja2
from aiohttp import web
from json_utils import json_dumps
from pychess_global_app_state_utils import get_app_state
from timeline import TIMELINE_PAGE_MAX
from typing_defs import ViewContext

from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def timeline(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)
    if user.anon:
        raise web.HTTPFound("/login")

    app_state = get_app_state(request.app)
    context["title"] = "Timeline • PyChess"
    context["view"] = "timeline"
    context["view_css"] = "timeline.css"
    context["timeline"] = json_dumps(
        await app_state.timeline.entries_for(user.username, limit=TIMELINE_PAGE_MAX)
    )
    return context
