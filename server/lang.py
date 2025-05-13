from contextvars import ContextVar

import aiohttp_session
from aiohttp import web

from const import LANGUAGES
from pychess_global_app_state_utils import get_app_state

LOCALE: ContextVar[str] = ContextVar("LOCALE", default="en")


def get_locale_ext(context):
    lang = context["lang"]
    return (".%s" % lang) if lang in ("es", "hu", "it", "pt", "fr", "zh_CN", "zh_TW") else ""


async def select_lang(request):
    app_state = get_app_state(request.app)
    data = await request.post()
    lang = data.get("lang")

    if lang is not None:
        referer = request.headers.get("REFERER")
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        if session_user in app_state.users:
            user = app_state.users[session_user]
            user.lang = lang
            if app_state.db is not None:
                await app_state.db.user.find_one_and_update(
                    {"_id": user.username}, {"$set": {"lang": lang}}
                )
        session["lang"] = lang
        return web.HTTPFound(referer)
    else:
        raise web.HTTPNotFound()


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
