import asyncio
import json
import logging
import warnings
import functools
from datetime import datetime
from functools import partial
from urllib.parse import urlparse

from aiohttp import web
import aioauth_client
import aiohttp_session
from aiohttp_sse import sse_response

from broadcast import round_broadcast
from const import STARTED, MATE, VARIANTS, VARIANT_ICONS
from settings import MAX_AGE, URI, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH, DEV_TOKEN1, DEV_TOKEN2
from glicko2.glicko2 import DEFAULT_PERF
from utils import load_game, pgn, tv_game, tv_game_user
from user import User
from fairy import FairyBoard
from bot_api import account, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong, bot_analysis
from fishnet import fishnet_monitor, fishnet_key, fishnet_acquire,\
    fishnet_abort, fishnet_analysis, fishnet_move

from wsl import lobby_socket_handler
from wsr import round_socket_handler
from compress import C2V, V2C, C2R
from glicko2.glicko2 import PROVISIONAL_PHI

try:
    import htmlmin

    html_minify = functools.partial(
        htmlmin.minify, remove_optional_attribute_quotes=False)
except ImportError:
    warnings.warn("Not using HTML minification, htmlmin not imported.")

    def html_minify(html):
        return html


log = logging.getLogger(__name__)

GAME_PAGE_SIZE = 12


async def oauth(request):
    """ Get lichess.org oauth token. """
    # TODO: check https://lichess.org/api/user/{username}
    # see https://lichess.org/api#operation/apiUser
    # and disable login if engine or booster is true or user is disabled
    client = aioauth_client.LichessClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )

    if not request.query.get("code"):
        raise web.HTTPFound(client.get_authorize_url(
            # scope="email:read",
            redirect_uri=REDIRECT_URI
        ))
    try:
        token_data = await client.get_access_token(
            request.query.get("code"),
            redirect_uri=REDIRECT_URI
        )
        token, data = token_data
        session = await aiohttp_session.get_session(request)
        session["token"] = token
    except Exception:
        log.error("Failed to get oauth access token.")
    raise web.HTTPFound("/login")


async def login(request):
    """ Login with lichess.org oauth. """
    if REDIRECT_PATH is None:
        log.error("Set REDIRECT_PATH env var if you want lichess OAuth login!")
        raise web.HTTPFound("/")

    # TODO: flag and ratings using lichess.org API
    session = await aiohttp_session.get_session(request)

    if DEV_TOKEN1 and DEV_TOKEN2:
        if "dev_token" in request.app:
            session["token"] = DEV_TOKEN2
        else:
            session["token"] = DEV_TOKEN1
        request.app["dev_token"] = True

    if "token" not in session:
        raise web.HTTPFound(REDIRECT_PATH)

    client = aioauth_client.LichessClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        access_token=session["token"])

    try:
        user, info = await client.user_info()
    except Exception:
        log.error("Failed to get user info from lichess.org")
        log.exception("ERROR: Exception in login(request) user, info = await client.user_info()!")
        raise web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s %s %s" % (user.id, user.username, user.country))
    users = request.app["users"]

    prev_session_user = session.get("user_name")
    prev_user = users.get(prev_session_user)
    if prev_user is not None:
        prev_user.lobby_ws = None  # make it offline

    session["user_name"] = user.username
    session["country"] = user.country
    session["first_name"] = user.first_name
    session["last_name"] = user.last_name
    session["title"] = user.gender if user.gender is not None else ""

    if user.username:
        db = request.app["db"]
        doc = await db.user.find_one({"_id": user.username})
        if doc is None:
            result = await db.user.insert_one({
                "_id": user.username,
                "first_name": session.get("first_name"),
                "last_name": session.get("last_name"),
                "country": session.get("country"),
                "title": session.get("title"),
                "perfs": {},
            })
            print("db insert user result %s" % repr(result.inserted_id))
        elif not doc.get("enabled", True):
            log.info("Closed account %s tried to log in." % user.username)
            session["user_name"] = prev_session_user

        del session["token"]

    raise web.HTTPFound("/")


async def logout(request):
    users = request.app["users"]

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users.get(session_user)

    # close lobby socket
    if session_user in request.app["websockets"]:
        ws = request.app["websockets"][session_user]
        response = {"type": "logout"}
        await ws.send_json(response)

    # lose and close game sockets
    # TODO: this can't end game if logout came from an ongoing game
    # because its ws was already closed and removed from game_sockets
    if user is not None:
        for gameId in user.game_sockets:
            game = request.app["games"][gameId]
            if game.status <= STARTED:
                response = await game.abandone(user)
                await round_broadcast(game, users, response, full=True)

    session.invalidate()

    raise web.HTTPFound("/")


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
        offline_users = (u for u in users.values() if not u.online(user.username) and not u.anon)
        anon_online = sum((1 for u in users.values() if u.anon and u.online(user.username)))

        render["icons"] = VARIANT_ICONS
        render["users"] = users
        render["online_users"] = online_users
        render["anon_online"] = anon_online
        render["offline_users"] = offline_users
        render["highscore"] = request.app["highscore"]

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
        variant = variant
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


async def get_user_games(request):
    users = request.app["users"]
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    filter_cond = {}
    # print("URL", request.rel_url)
    level = request.rel_url.query.get("x")
    variant = request.path[request.path.rfind("/") + 1:]
    if level is not None:
        filter_cond["x"] = int(level)
        filter_cond["s"] = MATE
        filter_cond["if"] = None

    if "/win" in request.path:
        filter_cond["$or"] = [{"r": "a", "us.0": profileId}, {"r": "b", "us.1": profileId}]
    elif "/loss" in request.path:
        filter_cond["$or"] = [{"r": "a", "us.1": profileId}, {"r": "b", "us.0": profileId}]
    elif variant in VARIANTS:
        if variant.endswith("960"):
            v = V2C[variant[:-3]]
            z = 1
        else:
            v = V2C[variant]
            z = 0
        filter_cond["$or"] = [{"v": v, "z": z, "us.1": profileId}, {"v": v, "z": z, "us.0": profileId}]
    else:
        filter_cond["us"] = profileId

    page_num = request.rel_url.query.get("p")
    if not page_num:
        page_num = 0

    game_doc_list = []
    if profileId is not None:
        # print("FILTER:", filter_cond)
        cursor = db.game.find(filter_cond)
        cursor.sort('d', -1).skip(int(page_num) * GAME_PAGE_SIZE).limit(GAME_PAGE_SIZE)
        async for doc in cursor:
            # filter out private games
            if "p" in doc and doc["p"] == 1 and session_user != doc["us"][0] and session_user != doc["us"][1]:
                continue

            doc["v"] = C2V[doc["v"]]
            doc["r"] = C2R[doc["r"]]
            doc["wt"] = users[doc["us"][0]].title if doc["us"][0] in users else ""
            doc["bt"] = users[doc["us"][1]].title if doc["us"][1] in users else ""
            game_doc_list.append(doc)
    # print("GAMES:", game_doc_list)
    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def subscribe_games(request):
    async with sse_response(request) as response:
        app = request.app
        queue = asyncio.Queue()
        app['channels'].add(queue)
        try:
            while not response.task.done():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
        finally:
            app['channels'].remove(queue)
    return response


async def subscribe_notify(request):
    async with sse_response(request) as response:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")

        user = request.app["users"].get(session_user)
        if user is None:
            return response

        user.notify_queue = asyncio.Queue()
        try:
            while not response.task.done():
                payload = await user.notify_queue.get()
                await response.send(payload)
                user.notify_queue.task_done()
        finally:
            user.notify_queue = None
    return response


async def get_games(request):
    games = request.app["games"]
    # TODO: filter last 10 by variant
    return web.json_response([
        {"gameId": game.id, "variant": game.variant, "fen": game.board.fen, "w": game.wplayer.username, "b": game.bplayer.username}
        for game in games.values() if game.status == STARTED][-20:])


async def export(request):
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    game_list = []
    if profileId is not None:
        if profileId == "all_games" and session_user in request.app["fishnet_versions"]:
            cursor = db.game.find()
        else:
            cursor = db.game.find({"us": profileId})

        async for doc in cursor:
            try:
                game_list.append(pgn(doc))
            except Exception:
                log.error("Failed to load game %s %s %s (early games may contain invalid moves)" % (doc["_id"], C2V[doc["v"]], doc["d"].strftime("%Y.%m.%d")))
                continue

    pgn_text = "\n".join(game_list)
    return web.Response(text=pgn_text, content_type="text/pgn")


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/logout", logout),
    ("/", index),
    ("/about", index),
    ("/players", index),
    ("/games", index),
    ("/tv", index),
    ("/editor/{variant}", index),
    ("/editor/{variant}/{fen}", index),
    (r"/{gameId:\w{8}}", index),
    ("/@/{profileId}", index),
    ("/@/{profileId}/tv", index),
    ("/@/{profileId}/challenge", index),
    ("/@/{profileId}/challenge/{variant}", index),
    ("/@/{profileId}/{variant}", index),
    ("/level8win", index),
    ("/patron", index),
    ("/patron/thanks", index),
    ("/variant", index),
    ("/variant/{variant}", index),
    ("/wsl", lobby_socket_handler),
    ("/wsr", round_socket_handler),
    ("/api/account", account),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
    ("/api/{profileId}/all", get_user_games),
    ("/api/{profileId}/win", get_user_games),
    ("/api/{profileId}/loss", get_user_games),
    ("/api/{profileId}/{variant}", get_user_games),
    ("/api/games", get_games),
    ("/api/ongoing", subscribe_games),
    ("/api/notify", subscribe_notify),
    ("/games/export/{profileId}", export),
    ("/games/export/variant/{variant}", export),
    ("/fishnet/monitor", fishnet_monitor),
    ("/fishnet/key/{key}", fishnet_key),
)

post_routes = (
    ("/api/bot/game/{gameId}/abort", bot_abort),
    ("/api/bot/game/{gameId}/resign", bot_resign),
    ("/api/bot/game/{gameId}/analysis", bot_analysis),
    ("/api/bot/game/{gameId}/chat", bot_chat),
    ("/api/bot/game/{gameId}/move/{move}", bot_move),
    ("/api/challenge/{username}", challenge_create),
    ("/api/challenge/{challengeId}/accept", challenge_accept),
    ("/api/challenge/{challengeId}/decline", challenge_decline),
    ("/api/seek", create_bot_seek),
    ("/api/pong", bot_pong),
    ("/fishnet/acquire", fishnet_acquire),
    ("/fishnet/analysis/{workId}", fishnet_analysis),
    ("/fishnet/move/{workId}", fishnet_move),
    ("/fishnet/abort/{workId}", fishnet_abort),
)
