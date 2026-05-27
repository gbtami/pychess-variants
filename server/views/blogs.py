import aiohttp_jinja2
from aiohttp import web

from utils import get_blogs
from typing_defs import ViewContext
from views import get_user_context


@aiohttp_jinja2.template("blogs.html")
async def blogs(request: web.Request) -> ViewContext:
    _user, context = await get_user_context(request)

    tag = (request.rel_url.query.get("tags") or "").strip().lower()
    blogs = await get_blogs(request, tag=tag, limit=0)
    context["site_tag"] = tag
    context["site_tags"] = sorted(
        {
            str(topic)
            for blog in blogs
            for topic in blog.get("topics", [])
            if isinstance(topic, str) and topic.strip() != ""
        }
    )

    context["blogs"] = blogs
    return context
