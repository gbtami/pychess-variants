import aiohttp_jinja2

from views import get_user_context


@aiohttp_jinja2.template("404.html")
async def page404(request):
    user, context = await get_user_context(request)

    context["view_css"] = "404.css"

    return context
