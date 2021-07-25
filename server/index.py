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

from const import LANGUAGES, TROPHIES, VARIANTS, VARIANT_ICONS, CASUAL, RATED, IMPORTED, variant_display_name, pairing_system_name
from fairy import FairyBoard
from glicko2.glicko2 import DEFAULT_PERF, PROVISIONAL_PHI
from robots import ROBOTS_TXT
from settings import ADMINS, MAX_AGE, URI, STATIC_ROOT, BR_EXTENSION, SOURCE_VERSION, DEV
from misc import time_control_str
from news import NEWS
from user import User
from utils import load_game, tv_game, tv_game_user
from tournaments import get_latest_tournaments, load_tournament, create_tournament

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
        log.info("+++ Existing user %s connected.", session_user)
        doc = None
        try:
            doc = await db.user.find_one({"_id": session_user})
        except Exception:
            log.error("Failed to get user %s from mongodb!", session_user)
        if doc is not None:
            session["guest"] = False

            if not doc.get("enabled", True):
                log.info("Closed account %s tried to connect.", session_user)
                session.invalidate()
                return web.HTTPFound("/")

        if session_user in users:
            user = users[session_user]
        else:
            if session_user.startswith("Anon-"):
                session.invalidate()
                return web.HTTPFound(request.rel_url)

            log.debug("New lichess user %s joined.", session_user)
            title = session["title"] if "title" in session else ""
            perfs = {variant: DEFAULT_PERF for variant in VARIANTS}
            user = User(request.app, username=session_user, anon=session["guest"], title=title, perfs=perfs)
            users[user.username] = user
    else:
        user = User(request.app, anon=True)
        log.info("+++ New guest user %s connected.", user.username)
        users[user.username] = user
        session["user_name"] = user.username

    lang = session.get("lang", "en")
    get_template = request.app["jinja"][lang].get_template

    view = "lobby"
    gameId = request.match_info.get("gameId")
    ply = request.rel_url.query.get("ply")

    tournamentId = request.match_info.get("tournamentId")

    if request.path == "/about":
        view = "about"
    elif request.path == "/faq":
        view = "faq"
    elif request.path == "/stats":
        view = "stats"
    elif request.path.startswith("/news"):
        view = "news"
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
    elif request.path.startswith("/analysis"):
        view = "analysis"
    elif request.path.startswith("/embed"):
        view = "embed"
    elif request.path == "/paste":
        view = "paste"
    elif request.path.startswith("/tournaments"):
        view = "tournaments"
        if request.path.endswith("/new"):
            view = "arena-new"
        elif request.path.endswith("/arena"):
            data = await request.post()
            await create_tournament(request.app, user.username, data)
    elif request.path.startswith("/tournament"):
        view = "tournament"
        tournament = await load_tournament(request.app, tournamentId)

        if tournament is None:
            return web.HTTPFound("/")

        if request.path.endswith("/pause") and user in tournament.players:
            await tournament.pause(user)

    profileId = request.match_info.get("profileId")
    variant = request.match_info.get("variant")
    if (variant is not None) and ((variant not in VARIANTS) and variant != "terminology"):
        log.debug("Invalid variant %s in request", variant)
        return web.Response(status=404)

    fen = request.rel_url.query.get("fen")
    rated = None

    if (fen is not None) and "//" in fen:
        log.debug("Invelid FEN %s in request", fen)
        return web.Response(status=404)

    if profileId is not None:
        view = "profile"
        if request.path[-3:] == "/tv":
            view = "tv"
            # TODO: tv for variants
            gameId = await tv_game_user(db, users, profileId)
        elif request.path[-7:] == "/import":
            rated = IMPORTED
        elif request.path[-6:] == "/rated":
            rated = RATED
        elif "/challenge" in request.path:
            view = "lobby"
            if user.anon:
                return web.HTTPFound("/")

    # Do we have gameId in request url?
    if gameId is not None:
        if view not in ("tv", "analysis", "embed"):
            view = "round"
        invites = request.app["invites"]
        if (gameId not in games) and (gameId in invites):
            if not request.path.startswith("/invite/accept/"):
                seek_id = invites[gameId].id
                seek = request.app["seeks"][seek_id]
                view = "invite"
                inviter = seek.user.username if user.username != seek.user.username else ""

        if view != "invite":
            game = await load_game(request.app, gameId, user=user)
            if game is None:
                log.debug("Requested game %s not in app['games']", gameId)
                template = get_template("404.html")
                text = await template.render_async({"home": URI})
                return web.Response(
                    text=html_minify(text), content_type="text/html")

            if (ply is not None) and (view != "embed"):
                view = "analysis"

            if user.username != game.wplayer.username and user.username != game.bplayer.username:
                game.spectators.add(user)

    if view in ("profile", "level8win"):
        if (profileId in users) and not users[profileId].enabled:
            template = get_template("closed.html")
        else:
            template = get_template("profile.html")
    elif view == "players":
        template = get_template("players.html")
    elif view == "allplayers":
        template = get_template("allplayers.html")
    elif view == "tournaments":
        template = get_template("tournaments.html")
    elif view == "arena-new":
        template = get_template("arena-new.html")
    elif view == "news":
        template = get_template("news.html")
    elif view == "variant":
        template = get_template("variant.html")
    elif view == "patron":
        template = get_template("patron.html")
    elif view == "faq":
        template = get_template("FAQ.html")
    elif view == "analysis":
        template = get_template("analysis.html")
    elif view == "embed":
        template = get_template("embed.html")
    else:
        template = get_template("index.html")

    render = {
        "js": "/static/pychess-variants.js%s%s" % (BR_EXTENSION, SOURCE_VERSION),
        "dev": DEV,
        "app_name": "PyChess",
        "languages": LANGUAGES,
        "lang": lang,
        "title": view.capitalize(),
        "view": view,
        "asseturl": STATIC_ROOT,
        "view_css": ("round" if view == "tv" else view) + ".css",
        "home": URI,
        "user": user.username if session["guest"] else "",
        "anon": user.anon,
        "username": user.username,
        "guest": session["guest"],
        "profile": profileId if profileId is not None else "",
        "variant": variant if variant is not None else "",
        "fen": fen.replace(".", "+").replace("_", " ") if fen is not None else "",
        "variants": VARIANTS,
        "variant_display_name": variant_display_name,
    }

    if view in ("profile", "level8win"):
        if view == "level8win":
            profileId = "Fairy-Stockfish"
            render["trophies"] = []
        else:
            hs = request.app["highscore"]
            render["trophies"] = [(variant, "top10") for variant in hs if profileId in hs[variant]]
            for i, (variant, kind) in enumerate(render["trophies"]):
                if hs[variant].peekitem(0)[0] == profileId:
                    render["trophies"][i] = (variant, "top1")
            render["trophies"] = sorted(render["trophies"], key=lambda x: x[1])

        render["title"] = "Profile • " + profileId
        render["icons"] = VARIANT_ICONS
        render["cup"] = TROPHIES
        if profileId not in users or users[profileId].perfs is None:
            render["ratings"] = {}
        else:
            render["ratings"] = {
                k: ("%s%s" % (int(round(v["gl"]["r"], 0)), "?" if v["gl"]["d"] > PROVISIONAL_PHI else ""), v["nb"])
                for (k, v) in sorted(users[profileId].perfs.items(), key=lambda x: x[1]["nb"], reverse=True)}
        if variant is not None:
            render["variant"] = variant
        render["profile_title"] = users[profileId].title if profileId in users else ""
        render["rated"] = rated

    elif view == "players":
        online_users = [u for u in users.values() if u.username == user.username or (u.online and not u.anon)]
        anon_online = sum((1 for u in users.values() if u.anon and u.online))

        render["icons"] = VARIANT_ICONS
        render["users"] = users
        render["online_users"] = online_users
        render["anon_online"] = anon_online
        # render["offline_users"] = offline_users
        hs = request.app["highscore"]
        render["highscore"] = {variant: dict(hs[variant].items()[:10]) for variant in hs}

    elif view == "allplayers":
        allusers = [u for u in users.values() if not u.anon]
        render["allusers"] = allusers

    elif view == "tournaments":
        render["icons"] = VARIANT_ICONS
        render["pairing_system_name"] = pairing_system_name
        render["time_control_str"] = time_control_str
        render["tables"] = await get_latest_tournaments(request.app)
        render["admin"] = user.username in ADMINS.split(",")

    if gameId is not None:
        if view == "invite":
            render["gameid"] = gameId
            render["variant"] = seek.variant
            render["chess960"] = seek.chess960
            render["rated"] = seek.rated
            render["base"] = seek.base
            render["inc"] = seek.inc
            render["byo"] = seek.byoyomi_period
            render["inviter"] = inviter
        else:
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
            if ply is not None:
                render["ply"] = ply
            if game.tournamentId is not None:
                render["tournamentid"] = game.tournamentId

    if tournamentId is not None:
        render["tournamentid"] = tournamentId
        render["profile_title"] = tournament.name
        render["variant"] = tournament.variant
        render["chess960"] = tournament.chess960
        render["rated"] = RATED if tournament.rated else CASUAL
        render["base"] = tournament.base
        render["inc"] = tournament.inc
        render["byo"] = tournament.byoyomi_period
        render["fen"] = tournament.fen
        render["date"] = tournament.starts_at
        render["status"] = tournament.status

    if view == "level8win":
        render["level"] = 8
        render["profile"] = "Fairy-Stockfish"

    elif view == "variant":
        render["icons"] = VARIANT_ICONS
        # variant None indicates intro.md
        if lang in ("es", "hu", "it", "pt", "fr"):
            locale = ".%s" % lang
        elif lang == "zh":
            # Only intro.md
            locale = ".%s" % lang if variant in (None,) else ""
        else:
            locale = ""
        if variant == "terminology":
            render["variant"] = "docs/terminology%s.html" % locale
        else:
            render["variant"] = "docs/" + ("intro" if variant is None else variant) + "%s.html" % locale

    elif view == "news":
        news_item = request.match_info.get("news_item")
        if (news_item is None) or (news_item not in NEWS):
            news_item = list(NEWS.keys())[0]
        news_item = news_item.replace("_", " ")

        render["news"] = NEWS
        render["news_item"] = "news/%s.html" % news_item

    elif view == "faq":
        # TODO: make it translatable similar to above variant pages
        render["faq"] = "docs/faq.html"

    elif view == "editor" or (view == "analysis" and gameId is None):
        if fen is None:
            fen = FairyBoard(variant).start_fen(variant)
        else:
            fen = fen.replace(".", "+").replace("_", " ")
        render["variant"] = variant
        render["fen"] = fen

    try:
        text = await template.render_async(render)
    except Exception:
        return web.HTTPFound("/")

    # log.debug("Response: %s" % text)
    response = web.Response(text=html_minify(text), content_type="text/html")
    parts = urlparse(URI)
    response.set_cookie("user", session["user_name"], domain=parts.hostname, secure=parts.scheme == "https", samesite="Lax", max_age=None if user.anon else MAX_AGE)
    return response


async def robots(request):
    return web.Response(text=ROBOTS_TXT, content_type="text/plain")


async def select_lang(request):
    data = await request.post()
    lang = data.get("lang")

    if lang is not None:
        referer = request.headers.get('REFERER')
        session = await aiohttp_session.get_session(request)
        session["lang"] = lang
        return web.HTTPFound(referer)
    else:
        return web.Response(status=404)
