import aiohttp_jinja2
from aiohttp import web
from pychess_global_app_state_utils import get_app_state
from settings import ADMINS
from typing_defs import ViewContext
from variants import VARIANT_ICONS

from views import get_user_context


@aiohttp_jinja2.template("players.html")
async def players(request: web.Request) -> ViewContext:
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    online_users = [
        u
        for u in app_state.users.values()
        if not u.anon and (u.username == user.username or u.online)
    ]
    anon_online = sum(1 for u in app_state.users.values() if u.anon and u.online)

    context["icons"] = VARIANT_ICONS
    context["users"] = app_state.users
    context["online_users"] = online_users
    context["anon_online"] = anon_online
    context["admin"] = user.username in ADMINS

    variant = request.match_info.get("variant")

    if variant is None:
        allowed_variants = context["category_variant_set"]
        highscore = {
            variant: dict(app_state.highscore[variant].items()[:10])
            for variant in app_state.highscore
            if variant in allowed_variants
        }
        context["highscore"] = highscore
        highscore_usernames = {
            entry.split("|", 1)[0] for scores in highscore.values() for entry in scores
        }
        context["highscore_patrons"] = await app_state.public_users.get_patrons(highscore_usernames)
        context["highscore_online"] = {
            username
            for username in highscore_usernames
            if (live_user := app_state.users.data.get(username)) is not None and live_user.online
        }

    return context
