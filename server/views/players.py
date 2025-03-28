import aiohttp_jinja2

from views import get_user_context
from settings import ADMINS
from pychess_global_app_state_utils import get_app_state
from variants import ALL_VARIANTS, VARIANTS, VARIANT_ICONS


@aiohttp_jinja2.template("players.html")
async def players(request):
    user, context = await get_user_context(request)

    app_state = get_app_state(request.app)
    online_users = [
        u
        for u in app_state.users.values()
        if u.username == user.username or (u.online and not u.anon)
    ]
    anon_online = sum((1 for u in app_state.users.values() if u.anon and u.online))

    context["icons"] = VARIANT_ICONS
    context["users"] = app_state.users
    context["online_users"] = online_users
    context["anon_online"] = anon_online
    context["admin"] = user.username in ADMINS

    variant = request.match_info.get("variant")
    lang = context["lang"]

    def variant_display_name(variant):
        return app_state.translations[lang].gettext(ALL_VARIANTS[variant].translated_name)

    context["variant_display_name"] = variant_display_name

    if variant is None:
        context["highscore"] = {
            variant: dict(app_state.highscore[variant].items()[:10])
            for variant in app_state.highscore
            if variant in VARIANTS
        }

    return context
