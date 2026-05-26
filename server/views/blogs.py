import aiohttp_jinja2
from aiohttp import web

from blogs import BLOG_TAGS
from ublog import display_date, image_src, post_url, summary_from_markdown
from utils import get_blogs
from typing_defs import ViewContext
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("blogs.html")
async def blogs(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    tag = request.rel_url.query.get("tags")
    blogs = await get_blogs(request, tag=tag, limit=0)

    lang = context["lang"]

    def blog_tag(tag: str) -> str:
        return app_state.translations[lang].gettext(BLOG_TAGS.get(tag, tag))

    context["blog_tag"] = blog_tag

    context["blogs"] = blogs
    context["community_posts"] = []
    if app_state.db is not None:
        posts = await (
            app_state.db.ublog_post.find({"live": True})
            .sort([("sticky", -1), ("publishedAt", -1), ("createdAt", -1)])
            .limit(6)
            .to_list(6)
        )
        titles = await app_state.public_users.get_titles(
            str(post.get("author") or "") for post in posts
        )
        context["community_posts"] = [
            {
                "_id": post["_id"],
                "title": str(post.get("title") or ""),
                "intro": str(post.get("intro") or ""),
                "summary": summary_from_markdown(str(post.get("markdown") or "")),
                "author": str(post.get("author") or ""),
                "author_title": titles.get(str(post.get("author") or ""), ""),
                "date": display_date(post),
                "image": str(post.get("image") or ""),
                "image_src": image_src(post),
                "imageAlt": str(post.get("imageAlt") or ""),
                "url": post_url(post),
            }
            for post in posts
        ]
    if user.game_category != "all":
        available_tags = {tag for blog in blogs for tag in blog.get("tags", [])}
        context["tags"] = [tag for tag in BLOG_TAGS if tag in available_tags]
    else:
        context["tags"] = BLOG_TAGS

    return context
