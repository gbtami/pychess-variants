import aiohttp_jinja2
from aiohttp import web

from forum import forum_captcha_variant_for_category
from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def forum(request: web.Request) -> ViewContext:
    """Render the SPA entry point for all forum routes."""
    user, context = await get_user_context(request)
    context["title"] = "Forum • PyChess"
    context["view"] = "forum"
    context["view_css"] = "forum.css"
    context["variant"] = forum_captcha_variant_for_category(user.game_category)
    return context
