import asyncio
from datetime import datetime

import aiohttp_session
from aiohttp import web

from pychess_global_app_state import LOCALE
from pychess_global_app_state_utils import get_app_state
from logger import log
from const import (
    ANON_PREFIX,
    LANGUAGES,
)
from user import User


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

    context = {
        "user": user,
        "lang": LOCALE.get(),
        "theme": user.theme,
        "title": "%s • PyChess" % view.capitalize(),
        "view": view,
        "view_css": ("round" if view == "tv" else view) + ".css",
        "anon": user.anon,
        "username": user.username,
    }
    return (user, context)


def parse_accept_language(accept_language):
    languages = accept_language.split(",")
    locale_q_pairs = []

    for language in languages:
        parts = language.split(";")
        if parts[0] == language:
            # no q => q = 1
            locale_q_pairs.append((language.strip(), "1"))
        else:
            locale_q_pairs.append((parts[0].strip(), parts[1].split("=")[1]))

    return locale_q_pairs


def detect_locale(request):
    default_locale = "en"
    accept_language = request.headers.get("Accept-Language")

    if accept_language is not None:
        locale_q_pairs = parse_accept_language(accept_language)

        for pair in locale_q_pairs:
            for locale in LANGUAGES:
                # pair[0] is locale, pair[1] is q value
                if pair[0].replace("-", "_").lower().startswith(locale.lower()):
                    return locale

    return default_locale
