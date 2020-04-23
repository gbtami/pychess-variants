from datetime import datetime
import functools
import logging
from urllib.parse import urlparse
import warnings

from aiohttp import web
import aiohttp_session

try:
    import htmlmin

    html_minify = functools.partial(
        htmlmin.minify, remove_optional_attribute_quotes=False)
except ImportError:
    warnings.warn("Not using HTML minification, htmlmin not imported.")

    def html_minify(html):
        return html

from const import STARTED, VARIANTS, VARIANT_ICONS
from fairy import FairyBoard
from glicko2.glicko2 import DEFAULT_PERF, PROVISIONAL_PHI
from robots import ROBOTS_TXT
from settings import MAX_AGE, URI
from user import User
from utils import load_game, tv_game, tv_game_user

log = logging.getLogger(__name__)


async def index(request):
    """ Create home html. """

    users = request.app["users"]
    games = request.app["games"]
    db = request.app["db"]

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    session["last_visit"] = datetime.now().isoformat()
    session["guest"] = True
    if session_user is not None:
        log.info("+++ Existing user %s connected." % session_user)
        doc = None
        try:
            doc = await db.user.find_one({"_id": session_user})
        except Exception:
            log.error("Failed to get user %s from mongodb!" % session_user)
        if doc is not None:
            session["guest"] = False

            if not doc.get("enabled", True):
                log.info("Closed account %s tried to connect." % session_user)
                session.invalidate()
                raise web.HTTPFound("/")

        if session_user in users:
            user = users[session_user]
        else:
            if session_user.startswith("Anon-"):
                session.invalidate()
                raise web.HTTPFound("/")

            log.debug("New lichess user %s joined." % session_user)
            title = session["title"] if "title" in session else ""
            perfs = {variant: DEFAULT_PERF for variant in VARIANTS}
            user = User(request.app, username=session_user, anon=session["guest"], title=title, perfs=perfs)
            users[user.username] = user
        user.ping_counter = 0
    else:
        user = User(request.app, anon=True)
        log.info("+++ New guest user %s connected." % user.username)
        users[user.username] = user
        session["user_name"] = user.username

    view = "lobby"
    gameId = request.match_info.get("gameId")

    if request.path == "/about":
        view = "about"
    elif request.path.startswith("/variant"):
        view = "variant"
    elif request.path == "/players":
        view = "players"
    elif request.path == "/allplayers":
        view = "allplayers"
    elif request.path == "/games":
        view = "games"
    elif request.path == "/patron":
        view = "patron"
    elif request.path == "/patron/thanks":
        view = "thanks"
    elif request.path == "/level8win":
        view = "level8win"
    elif request.path == "/tv":
        view = "tv"
        gameId = await tv_game(db, request.app)
    elif request.path.startswith("/editor"):
        view = "editor"

    profileId = request.match_info.get("profileId")
    variant = request.match_info.get("variant")
    fen = request.rel_url.query.get("fen")

    if (fen is not None) and "//" in fen:
        return web.Response(status=404)

    if profileId is not None:
        view = "profile"
        if request.path[-3:] == "/tv":
            view = "tv"
            # TODO: tv for variants
            gameId = await tv_game_user(db, users, profileId)
        elif "/challenge" in request.path:
            view = "lobby"
            if user.anon:
                raise web.HTTPFound("/")

    # Do we have gameId in request url?
    if gameId is not None:
        if view != "tv":
            view = "round"
        game = await load_game(request.app, gameId)
        if game is None:
            log.debug("Requseted game %s not in app['games']" % gameId)
            template = request.app["jinja"].get_template("404.html")
            return web.Response(
                text=html_minify(template.render({"home": URI})), content_type="text/html")
        games[gameId] = game

        if game.status > STARTED:
            view = "analysis"

        if user.username != game.wplayer.username and user.username != game.bplayer.username:
            game.spectators.add(user)

    if view == "profile" or view == "level8win":
        if (profileId in users) and not users[profileId].enabled:
            template = request.app["jinja"].get_template("closed.html")
        else:
            template = request.app["jinja"].get_template("profile.html")
    elif view == "players":
        template = request.app["jinja"].get_template("players.html")
    elif view == "allplayers":
        template = request.app["jinja"].get_template("allplayers.html")
    elif view == "variant":
        template = request.app["jinja"].get_template("variant.html")
    elif view == "patron":
        template = request.app["jinja"].get_template("patron.html")
    else:
        template = request.app["jinja"].get_template("index.html")

    render = {
        "app_name": "PyChess",
        "title": view.capitalize(),
        "view": view,
        "home": URI,
        "user": user.username if session["guest"] else "",
        "anon": user.anon,
        "username": user.username,
        "country": session["country"] if "country" in session else "",
        "guest": session["guest"],
        "profile": profileId if profileId is not None else "",
        "variant": variant if variant is not None else "",
        "fen": fen.replace(".", "+").replace("_", " ") if fen is not None else "",
    }
    if view == "profile" or view == "level8win":
        if view == "level8win":
            profileId = "Fairy-Stockfish"
        render["title"] = "Profile • " + profileId
        render["icons"] = VARIANT_ICONS
        if profileId not in users or users[profileId].perfs is None:
            render["ratings"] = {}
        else:
            render["ratings"] = {
                k: ("%s%s" % (int(round(v["gl"]["r"], 0)), "?" if v["gl"]["d"] > PROVISIONAL_PHI else ""), v["nb"])
                for (k, v) in sorted(users[profileId].perfs.items(), key=lambda x: x[1]["nb"], reverse=True)}
        if variant is not None:
            render["variant"] = variant
        render["profile_title"] = users[profileId].title if profileId in users else ""

    if view == "players":
        online_users = [u for u in users.values() if u.online(user.username) and not u.anon]
        # offline_users = (u for u in users.values() if not u.online(user.username) and not u.anon)
        anon_online = sum((1 for u in users.values() if u.anon and u.online(user.username)))

        render["icons"] = VARIANT_ICONS
        render["users"] = users
        render["online_users"] = online_users
        render["anon_online"] = anon_online
        # render["offline_users"] = offline_users
        render["highscore"] = request.app["highscore"]
    elif view == "allplayers":
        allusers = [u for u in users.values() if not u.anon]
        render["allusers"] = allusers

    if gameId is not None:
        render["gameid"] = gameId
        render["variant"] = game.variant
        render["wplayer"] = game.wplayer.username
        render["wtitle"] = game.wplayer.title
        render["wrating"] = game.wrating
        render["wrdiff"] = game.wrdiff
        render["chess960"] = game.chess960
        render["rated"] = game.rated
        render["level"] = game.level
        render["bplayer"] = game.bplayer.username
        render["btitle"] = game.bplayer.title
        render["brating"] = game.brating
        render["brdiff"] = game.brdiff
        render["fen"] = game.board.fen
        render["base"] = game.base
        render["inc"] = game.inc
        render["byo"] = game.byoyomi_period
        render["result"] = game.result
        render["status"] = game.status
        render["date"] = game.date.isoformat()
        render["title"] = game.wplayer.username + ' vs ' + game.bplayer.username

    if view == "level8win":
        render["level"] = 8
        render["profile"] = "Fairy-Stockfish"

    elif view == "variant":
        render["variants"] = VARIANTS
        render["icons"] = VARIANT_ICONS
        if variant == "terminology":
            render["variant"] = "terminology.html"
        else:
            render["variant"] = ("intro" if variant is None else variant) + ".html"

    elif view == "editor":
        if fen is None:
            fen = FairyBoard(variant).start_fen(variant)
        render["variant"] = variant
        render["fen"] = fen

    try:
        text = template.render(render)
    except Exception:
        raise web.HTTPFound("/")

    # log.debug("Response: %s" % text)
    response = web.Response(text=html_minify(text), content_type="text/html")
    hostname = urlparse(URI).hostname
    response.set_cookie("user", session["user_name"], domain=hostname, secure="." not in hostname, max_age=None if user.anon else MAX_AGE)
    return response


async def robots(request):
    return web.Response(text=ROBOTS_TXT, content_type="text/plain")
