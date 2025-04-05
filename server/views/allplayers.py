import aiohttp_jinja2

from views import get_user_context
from pychess_global_app_state_utils import get_app_state


@aiohttp_jinja2.template("allplayers.html")
async def allplayers(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)

    allusers = [u for u in app_state.users.values() if not u.anon]
    context["allusers"] = allusers

    return context
