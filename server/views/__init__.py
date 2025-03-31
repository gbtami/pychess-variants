import asyncio
from datetime import datetime

import aiohttp_session
from aiohttp import web

from pychess_global_app_state import LOCALE
from pychess_global_app_state_utils import get_app_state
from logger import log
from user import User
from variants import ALL_VARIANTS


def get_locale_ext(context):
    lang = context["lang"]
    return (".%s" % lang) if lang in ("es", "hu", "it", "pt", "fr", "zh_CN", "zh_TW") else ""


async def get_user_context(request):
    app_state = get_app_state(request.app)

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    session["last_visit"] = datetime.now().isoformat()
    if session_user is not None:
        log.info("+++ Existing user %s connected.", session_user)
        doc = None
        try:
            doc = await app_state.db.user.find_one({"_id": session_user})
        except Exception:
            log.error(
                "index() app_state.db.user.find_one Exception. Failed to get user %s from mongodb!",
                session_user,
            )
        if doc is not None:
            if not doc.get("enabled", True):
                log.info("Closed account %s tried to connect.", session_user)
                session.invalidate()
                return web.HTTPFound("/")

        if session_user in app_state.users:
            user = app_state.users[session_user]
        else:
            user = await app_state.users.get(session_user)

            if not user.enabled:
                session.invalidate()
                return web.HTTPFound("/")
    else:
        if app_state.disable_new_anons:
            session.invalidate()
            await asyncio.sleep(3)
            return web.HTTPFound("/login")

        user = User(app_state, anon=not app_state.anon_as_test_users)
        log.info("+++ New guest user %s connected.", user.username)
        app_state.users[user.username] = user
        session["user_name"] = user.username
        await asyncio.sleep(3)

    view = request.path.split("/")[1] if len(request.path) > 2 else "lobby"
    lang = LOCALE.get()
    gettext = app_state.translations[lang].gettext

    def variant_display_name(variant):
        return gettext(ALL_VARIANTS[variant].translated_name)

    context = {
        "user": user,
        "lang": lang,
        "variant_display_name": variant_display_name,
        "theme": user.theme,
        "title": "%s • PyChess" % view.capitalize(),
        "view": view,
        "view_css": ("round" if view == "tv" else view) + ".css",
        "anon": user.anon,
        "username": user.username,
    }
    return (user, context)
