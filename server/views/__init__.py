import asyncio
import json
from datetime import datetime

import aiohttp_session
from aiohttp import web

from const import DARK_FEN, STARTED
from fairy import BLACK, WHITE
from pychess_global_app_state import LOCALE
from pychess_global_app_state_utils import get_app_state
from logger import log
from user import User
from variants import ALL_VARIANTS


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


def add_game_context(game, ply, user, context):
    context["gameid"] = game.id
    context["variant"] = game.variant
    context["wplayer"] = game.wplayer.username
    context["wtitle"] = game.wplayer.title
    context["wrating"] = game.wrating
    context["wrdiff"] = game.wrdiff
    context["chess960"] = game.chess960
    context["rated"] = game.rated
    context["corr"] = game.corr
    context["level"] = game.level
    context["bplayer"] = game.bplayer.username
    context["btitle"] = game.bplayer.title
    context["brating"] = game.brating
    context["brdiff"] = game.brdiff
    context["fen"] = DARK_FEN if game.variant == "fogofwar" else game.fen
    context["posnum"] = game.board.posnum if game.status > STARTED else -1
    context["base"] = game.base
    context["inc"] = game.inc
    context["byo"] = game.byoyomi_period
    context["result"] = game.result
    context["status"] = game.status
    context["date"] = game.date.isoformat()
    context["title"] = game.browser_title
    # todo: I think sent ply value shouldn't be minus 1.
    #       But also it gets overwritten anyway right after that so why send all this stuff at all here.
    #       just init client on 1st ws board msg received right after ws connection is established
    context["ply"] = ply if ply is not None else game.ply - 1
    context["initialFen"] = game.initial_fen

    user_color = WHITE if user == game.wplayer else BLACK if user == game.bplayer else None
    context["board"] = json.dumps(game.get_board(full=True, persp_color=user_color))

    return
