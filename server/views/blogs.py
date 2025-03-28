import aiohttp_jinja2

from blogs import BLOG_TAGS
from utils import get_blogs
from views import get_user_context


@aiohttp_jinja2.template("blogs.html")
async def blogs(request):
    user, context = await get_user_context(request)

    tag = request.rel_url.query.get("tags")
    blogs = await get_blogs(request, tag=tag, limit=0)

    context["blogs"] = blogs
    context["tags"] = BLOG_TAGS

    return context
