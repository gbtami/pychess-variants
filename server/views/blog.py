from aiohttp import web

from const import category_matches
from ublog import post_url
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


async def blog(request: web.Request) -> web.StreamResponse:
    user, _context = await get_user_context(request)
    app_state = get_app_state(request.app)

    blog_id = request.match_info.get("blogId")
    if app_state.db is None or blog_id is None:
        raise web.HTTPNotFound()

    migrated = await app_state.db.ublog_post.find_one(
        {"legacyBlogId": blog_id, "live": True, "blogType": "site"},
        {"_id": 1, "author": 1, "slug": 1, "category": 1},
    )
    if migrated is None:
        raise web.HTTPNotFound()

    category = migrated.get("category", "all")
    if user.game_category != "all" and not category_matches(user.game_category, category):
        raise web.HTTPNotFound()

    raise web.HTTPFound(post_url(migrated))
