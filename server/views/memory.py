import aiohttp_jinja2
from views import get_user_context


@aiohttp_jinja2.template("memory.html")
async def memory(request):
    user, context = await get_user_context(request)

    return context
