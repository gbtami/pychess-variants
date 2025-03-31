import aiohttp_jinja2
from views import get_user_context


@aiohttp_jinja2.template("profile.html")
async def level8win(request):
    user, context = await get_user_context(request)

    context["view_css"] = "profile.css"
    context["profile"] = "Fairy-Stockfish"
    context["level"] = 8

    return context
