import os

import aiohttp_jinja2

from blogs import BLOG_TAGS
from lang import get_locale_ext
from views import get_user_context


@aiohttp_jinja2.template("blog.html")
async def blog(request):
    user, context = await get_user_context(request)

    blogId = request.match_info.get("blogId")
    blog_item = blogId.replace("_", " ")

    # try translated blog file first
    item = "blogs/%s%s.html" % (blog_item, get_locale_ext(context))

    # if there is no translated use the untranslated one
    if not os.path.exists(os.path.abspath(os.path.join("templates", item))):
        item = "blogs/%s.html" % blog_item

    context["blog_item"] = item
    context["view_css"] = "blogs.css"
    context["tags"] = BLOG_TAGS

    return context
