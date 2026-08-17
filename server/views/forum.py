import aiohttp_jinja2
from aiohttp import web
from forum import forum_captcha_variant_for_category
from forum.access import can_moderate_forum_categ, can_read_forum_categ, can_write_forum_categ
from forum.storage import forum_categ_by_id
from pychess_global_app_state_utils import get_app_state
from typing_defs import ViewContext

from views import get_user_context


@aiohttp_jinja2.template("index.html")
async def forum(request: web.Request) -> ViewContext:
    """Render the SPA entry point for all forum routes."""
    user, context = await get_user_context(request)
    categ_id = request.match_info.get("categ")
    if categ_id:
        app_state = get_app_state(request.app)
        categ = await forum_categ_by_id(app_state, categ_id)
        if categ is not None:
            username = None if user.anon else user.username
            if not await can_read_forum_categ(app_state, categ, username):
                raise web.HTTPForbidden(text="You cannot access this forum.")
            if request.path.endswith("/form") and not await can_write_forum_categ(
                app_state, categ, user
            ):
                raise web.HTTPForbidden(text="You cannot post in this forum.")
            if request.path.endswith("/mod-feed") and not await can_moderate_forum_categ(
                app_state, categ, user
            ):
                raise web.HTTPForbidden(text="You cannot moderate this forum.")
    context["title"] = "Forum • PyChess"
    context["view"] = "forum"
    context["view_css"] = "forum.css"
    context["variant"] = forum_captcha_variant_for_category(context["game_category"])
    return context
