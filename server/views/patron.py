import aiohttp_jinja2

from views import get_user_context


@aiohttp_jinja2.template("patron.html")
async def patron(request):
    user, context = await get_user_context(request)

    if request.path == "/patron/thanks":
        context["view"] = "thanks"

    return context
