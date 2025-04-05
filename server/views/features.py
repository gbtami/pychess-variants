import aiohttp_jinja2

from views import get_user_context


@aiohttp_jinja2.template("features.html")
async def features(request):
    user, context = await get_user_context(request)

    return context
