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

from settings import URI, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH
from utils import load_game, pgn, User, STARTED, MATE
from bot_api import account, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong, bot_analysis
from fishnet import fishnet_monitor, fishnet_key, fishnet_acquire,\
    fishnet_abort, fishnet_analysis, fishnet_move

from wsl import lobby_socket_handler
from wsr import round_socket_handler
from compress import C2V, C2R

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
            })
            print("db insert user result %s" % repr(result.inserted_id))
        del session["token"]

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
        doc = await db.user.find_one({"_id": session_user})
        if doc is not None:
            session["guest"] = False
        if session_user in users:
            user = users[session_user]
        else:
            # If server was restarted, we have to recreate users
            user = User(username=session_user)
            users[user.username] = user
        user.ping_counter = 0
    else:
        user = User()
        log.info("+++ New guest user %s connected." % user.username)
        users[user.username] = user
        session["user_name"] = user.username
    user.online = True

    view = "lobby"
    gameId = request.match_info.get("gameId")

    if request.path == "/about":
        view = "about"
    elif request.path == "/howtoplay":
        view = "howtoplay"
    elif request.path == "/players":
        view = "players"
    elif request.path == "/patron/thanks":
        view = "thanks"
    elif request.path == "/level8win":
        view = "level8win"
    elif request.path == "/tv":
        view = "tv"
        doc = await db.game.find_one({}, sort=[('$natural', -1)])
        if doc is not None:
            gameId = doc["_id"]

    profileId = request.match_info.get("profileId")
    if profileId is not None:
        view = "profile"
        if request.path[-3:] == "/tv":
            view = "tv"
            # TODO: tv for variants
            doc = await db.game.find_one({"us": profileId}, sort=[('$natural', -1)])
            if doc is not None:
                gameId = doc["_id"]

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

    template = request.app["jinja"].get_template("index.html")
    render = {
        "app_name": "PyChess",
        "view": view,
        "home": URI,
        "user": user.username if session["guest"] else "",
        "anon": user.anon,
        "country": session["country"] if "country" in session else "",
        "guest": session["guest"],
        "profile": profileId if profileId is not None else "",
    }
    if gameId is not None:
        render["gameid"] = gameId
        render["variant"] = game.variant
        render["wplayer"] = game.wplayer.username
        render["chess960"] = game.chess960
        render["level"] = game.level
        render["wtitle"] = game.wplayer.title
        render["bplayer"] = game.bplayer.username
        render["btitle"] = game.bplayer.title
        render["fen"] = game.board.fen
        render["base"] = game.base
        render["inc"] = game.inc
        render["result"] = game.result
        render["status"] = game.status
        render["date"] = game.date.isoformat()

    if view == "level8win":
        render["level"] = 8
        render["profile"] = "Fairy-Stockfish"

    text = template.render(render)

    # log.debug("Response: %s" % text)
    response = web.Response(text=html_minify(text), content_type="text/html")
    hostname = urlparse(URI).hostname
    response.set_cookie("user", session["user_name"], domain=hostname, secure="." not in hostname, max_age=31536000)
    return response


async def get_games(request):
    users = request.app["users"]
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    filter_cond = {}
    # print("URL", request.rel_url)
    level = request.rel_url.query.get("x")
    if level is not None:
        filter_cond["x"] = int(level)

    if "/win" in request.path:
        filter_cond["$or"] = [{"r": "a", "us.0": profileId}, {"r": "b", "us.1": profileId}]
    elif "/loss" in request.path:
        filter_cond["$or"] = [{"r": "a", "us.1": profileId}, {"r": "b", "us.0": profileId}]
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

            # filter out anonymous players level8win games
            if (level is not None) and profileId == "Fairy-Stockfish":
                fairy_opp = doc["us"][0] if doc["us"][1] == "Fairy-Stockfish" else doc["us"][1]
                reg_user = await db.user.find_one({"_id": fairy_opp})
                if doc["s"] != MATE or reg_user is None:
                    continue

            doc["v"] = C2V[doc["v"]]
            doc["r"] = C2R[doc["r"]]
            doc["wt"] = users[doc["us"][0]].title if doc["us"][0] in users else ""
            doc["bt"] = users[doc["us"][1]].title if doc["us"][1] in users else ""
            game_doc_list.append(doc)
    # print("GAMES:", game_doc_list)
    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_players(request):
    users = request.app["users"]
    return web.json_response([user.as_json for user in users.values()], dumps=partial(json.dumps, default=datetime.isoformat))


async def export(request):
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    game_list = []
    if profileId is not None:
        cursor = db.game.find({"us": profileId})
        async for doc in cursor:
            # filter out private games
            if "p" in doc and doc["p"] == 1 and session_user != doc["us"][0] and session_user != doc["us"][1]:
                continue

            try:
                game_list.append(pgn(doc))
            except Exception:
                log.error("Failed to load game %s %s" % (doc["_id"], C2V[doc["v"]]))
    pgn_text = "\n".join(game_list)
    return web.Response(text=pgn_text, content_type="text/pgn")


async def variant(request):
    variant = request.match_info.get("variant")

    template = request.app["jinja"].get_template("variant.html")
    text = template.render({"variant": variant})
    return web.Response(text=html_minify(text), content_type="text/html")


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/", index),
    ("/about", index),
    ("/howtoplay", index),
    ("/players", index),
    ("/tv", index),
    (r"/{gameId:\w{8}}", index),
    ("/@/{profileId}", index),
    ("/@/{profileId}/tv", index),
    ("/level8win", index),
    ("/patron/thanks", index),
    ("/wsl", lobby_socket_handler),
    ("/wsr", round_socket_handler),
    ("/api/account", account),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
    ("/api/{profileId}/all", get_games),
    ("/api/{profileId}/win", get_games),
    ("/api/{profileId}/loss", get_games),
    ("/api/players", get_players),
    ("/variant/{variant}", variant),
    ("/games/export/{profileId}", export),
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
