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
from bot_api import account, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong
from utils import load_game, User
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
    # TODO: get it via licehess API
    session["title"] = ""

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
    elif request.path == "/players":
        view = "players"

    # TODO: tv for @player and for variants
    elif request.path == "/tv" and len(games) > 0:
        view = "tv"
        # TODO: get highest rated game
        gameId = list(games.keys())[-1]

    profileId = request.match_info.get("profile")
    if profileId is not None:
        view = "profile"

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

    page_num = request.rel_url.query.get("p")
    if not page_num:
        page_num = 0
    print("PAGENUm=", page_num)
    gameid_list = []
    if profileId is not None:
        cursor = db.game.find({"us": profileId})
        cursor.sort('d', -1).skip(int(page_num) * GAME_PAGE_SIZE).limit(GAME_PAGE_SIZE)
        async for doc in cursor:
            doc["v"] = C2V[doc["v"]]
            doc["r"] = C2R[doc["r"]]
            doc["wt"] = users[doc["us"][0]].title if doc["us"][0] in users else ""
            doc["bt"] = users[doc["us"][1]].title if doc["us"][1] in users else ""
            gameid_list.append(doc)

    return web.json_response(gameid_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_players(request):
    users = request.app["users"]
    return web.json_response([user.as_json for user in users.values()], dumps=partial(json.dumps, default=datetime.isoformat))


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/", index),
    ("/about", index),
    ("/players", index),
    ("/tv", index),
    (r"/{gameId:\w{8}}", index),
    ("/@/{profile}", index),
    ("/wsl", lobby_socket_handler),
    ("/wsr", round_socket_handler),
    ("/api/account", account),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
    ("/api/{profileId}/games", get_games),
    ("/api/players", get_players),
)

post_routes = (
    ("/api/bot/game/{gameId}/abort", bot_abort),
    ("/api/bot/game/{gameId}/resign", bot_resign),
    ("/api/bot/game/{gameId}/chat", bot_chat),
    ("/api/bot/game/{gameId}/move/{move}", bot_move),
    ("/api/challenge/{username}", challenge_create),
    ("/api/challenge/{challengeId}/accept", challenge_accept),
    ("/api/challenge/{challengeId}/decline", challenge_decline),
    ("/api/seek", create_bot_seek),
    ("/api/pong", bot_pong),
)
