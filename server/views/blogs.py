import aiohttp_jinja2

from blogs import BLOG_TAGS
from utils import get_blogs
from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("blogs.html")
async def blogs(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    tag = request.rel_url.query.get("tags")
    blogs = await get_blogs(request, tag=tag, limit=0)

    lang = context["lang"]

    def blog_tag(tag):
        return app_state.translations[lang].gettext(BLOG_TAGS.get(tag, tag))

    context["blog_tag"] = blog_tag

    context["blogs"] = blogs
    context["tags"] = BLOG_TAGS

    return context
