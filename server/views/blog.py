import os

import aiohttp_jinja2
from aiohttp import web

from const import category_matches
from blogs import BLOG_TAGS, BLOG_CATEGORIES, BLOGS
from lang import get_locale_ext
from views import get_user_context


@aiohttp_jinja2.template("blog.html")
async def blog(request):
    user, context = await get_user_context(request)

    blogId = request.match_info.get("blogId")
    if user.game_category != "all":
        category = BLOG_CATEGORIES.get(blogId, "all")
        if not category_matches(user.game_category, category):
            raise web.HTTPNotFound()
    blog_item = blogId.replace("_", " ")

    # try translated blog file first
    item = "blogs/%s%s.html" % (blog_item, get_locale_ext(context))

    # if there is no translated use the untranslated one
    if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
        item = "blogs/%s.html" % blog_item

    context["blog_item"] = item
    context["view_css"] = "blogs.css"
    if user.game_category != "all":
        available_tags = {
            tag
            for blog in BLOGS
            if category_matches(user.game_category, blog.get("category", "all"))
            for tag in blog.get("tags", [])
        }
        context["tags"] = [tag for tag in BLOG_TAGS if tag in available_tags]
    else:
        context["tags"] = BLOG_TAGS

    return context
