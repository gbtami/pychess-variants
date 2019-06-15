import asyncio
import json
import logging
import warnings
import functools
import datetime

import aiohttp
from aiohttp import web
import aioauth_client
import aiohttp_session

from settings import URI, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH
from bot_api import profile, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong
from utils import get_seeks, create_seek, accept_seek, challenge,\
    play_move, get_board, start, draw, resign, flag, User, Seek, STARTED


try:
    import htmlmin

    html_minify = functools.partial(
        htmlmin.minify, remove_optional_attribute_quotes=False)
except ImportError:
    warnings.warn("Not using HTML minification, htmlmin not imported.")

    def html_minify(html):
        return html


log = logging.getLogger(__name__)


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
        return web.HTTPFound(client.get_authorize_url(
            # scope="email:read",
            redirect_uri=REDIRECT_URI
        ))
    token_data = await client.get_access_token(
        request.query.get("code"),
        redirect_uri=REDIRECT_URI
    )
    token, data = token_data
    session = await aiohttp_session.get_session(request)
    session["token"] = token
    return web.HTTPFound("/login")


async def login(request):
    """ Login with lichess.org oauth. """
    if REDIRECT_PATH is None:
        log.error("Set REDIRECT_PATH env var if you want lichess OAuth login!")
        return web.HTTPFound("/")

    # TODO: flag and ratings using lichess.org API
    session = await aiohttp_session.get_session(request)
    if "token" not in session:
        return web.HTTPFound(REDIRECT_PATH)

    client = aioauth_client.LichessClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        access_token=session["token"])

    try:
        user, info = await client.user_info()
    except Exception:
        log.error("Failed to get user info from lichess.org")
        return web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s %s %s" % (user.id, user.username, user.country))

    return web.HTTPFound("/?username=%s&country=%s" % (user.username, user.country))


async def index(request):
    """ Create home html. """

    users = request.app["users"]
    games = request.app["games"]

    # Who made the request?
    session = await aiohttp_session.get_session(request)

    # Coming from login? We have params \o/
    params = request.rel_url.query
    logged_in_username = params.get("username")
    if logged_in_username:
        session["user_name"] = logged_in_username

    session_user = session.get("user_name")
    session["last_visit"] = datetime.datetime.now().isoformat()
    if session_user is not None:
        log.info("+++ Existing user %s reconnected." % session_user)
        if session_user in users:
            user = users[session_user]
        else:
            # If server was restarted, we have to recreate users
            # TODO: use redis aiohttp-session storage ?
            user = User(username=session_user)
            users[user.username] = user
        user.ping_counter = 0
    else:
        user = User()
        log.info("+++ New user %s connected." % user.username)
        users[user.username] = user
        session["user_name"] = user.username

    gameId = request.match_info.get("gameId")

    # TODO: tv for @player and for variants
    tv = ""
    if request.path == "/tv" and len(games) > 0:
        # TODO: get highest rated game
        active_games = (item for item in iter(games.items()) if item[1].status <= STARTED)
        try:
            gameId = next(active_games)[0]
            tv = "standard"
        except StopIteration:
            tv = ""

    # Do we have gameId in request url?
    if gameId is not None:
        game = games[gameId]
        if user.username != game.wplayer.username and user.username != game.bplayer.username:
            game.spectators.add(user)

    template = request.app["jinja"].get_template("index.html")
    render = {
        "app_name": "PyChess",
        "home": URI,
        "username": user.username,
        "country": params["country"] if "country" in params else "",
        "guest": not logged_in_username,
        "tv": tv,
        "gameid": gameId if gameId is not None else "",
        "variant": game.variant if gameId is not None else "",
        "wplayer": game.wplayer.username if gameId is not None else "",
        "bplayer": game.bplayer.username if gameId is not None else "",
        "fen": game.board.fen if gameId is not None else "",
        "base": game.base if gameId is not None else "",
        "inc": game.inc if gameId is not None else "",
    }
    text = template.render(render)

    # log.debug("Response: %s" % text)
    return web.Response(
        text=html_minify(text), content_type="text/html")


async def websocket_handler(request):
    """ Handle incoming websocket messages.
        Get valid move destinations in initial FEN position or
        get opponent move + valid move destinations of given FEN.
    """

    users = request.app["users"]
    sockets = request.app["websockets"]
    seeks = request.app["seeks"]
    games = request.app["games"]

    ws = web.WebSocketResponse()

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        return web.HTTPFound("/")

    await ws.prepare(request)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users[session_user] if session_user else None

    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.TEXT:
            if type(msg.data) == str:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                else:
                    data = json.loads(msg.data)
                    if not data["type"] == "pong":
                        log.debug("Websocket (%s) message: %s" % (id(ws), msg))

                    if data["type"] == "move":
                        log.info("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
                        play_move(games, data)

                        board_response = get_board(games, data)
                        log.info("   Server send to %s: %s" % (user.username, board_response["fen"]))
                        await ws.send_json(board_response)

                        game = games[data["gameId"]]
                        if game.status > STARTED and user.is_bot:
                            await user.game_queues[data["gameId"]].put(game.game_end)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_state)
                            if game.status > STARTED:
                                await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            log.info("   Server send to %s: %s" % (opp_name, board_response["fen"]))
                            await opp_ws.send_json(board_response)

                        if game.spectators:
                            for spectator in game.spectators:
                                if data["gameId"] in users[spectator.username].game_sockets:
                                    await users[spectator.username].game_sockets[data["gameId"]].send_json(board_response)

                    elif data["type"] == "ready":
                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.event_queue.put(game.game_start)
                            response = start(games, data)
                            await ws.send_json(response)
                        else:
                            opp_ok = data["gameId"] in users[opp_name].game_sockets
                            # waiting for opp to be ready also
                            if not opp_ok:
                                loop = asyncio.get_event_loop()
                                end_time = loop.time() + 20.0
                                while True:
                                    if (loop.time() + 1.0) >= end_time:
                                        log.debug("Game %s aborted because user %s is not ready." % (data["gameId"], opp_name))
                                        response = game.abort()
                                        await ws.send_json(response)
                                        break
                                    await asyncio.sleep(1)
                                    opp_ok = data["gameId"] in users[opp_name].game_sockets
                                    if opp_ok:
                                        break
                            if opp_ok:
                                opp_ws = users[opp_name].game_sockets[data["gameId"]]
                                response = start(games, data)
                                await opp_ws.send_json(response)
                                await ws.send_json(response)

                    elif data["type"] == "board":
                        board_response = get_board(games, data)
                        log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
                        await ws.send_json(board_response)

                    elif data["type"] == "pong":
                        user = users[session_user]
                        user.ping_counter -= 1

                    elif data["type"] == "rematch":
                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if opp_player.is_bot:
                            variant = game.variant
                            if variant == "seirawan":
                                engine = users.get("Seirawan-Stockfish")
                            elif variant == "xiangqi":
                                engine = users.get("Elephant-Eye")
                            else:
                                engine = users.get("Fairy-Stockfish")

                            if engine is None or not engine.online:
                                continue

                            color = "w" if game.wplayer == opp_name else "b"
                            seek = Seek(user, game.variant, game.initial_fen, color, game.base, game.inc, game.skill_level)
                            seeks[seek.id] = seek

                            response = accept_seek(seeks, games, engine, seek.id)
                            await ws.send_json(response)

                            await engine.event_queue.put(challenge(seek, response))
                            gameId = response["gameId"]
                            engine.game_queues[gameId] = asyncio.Queue()
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            if opp_name in game.rematch_offers:
                                color = "w" if game.wplayer.username == opp_name else "b"
                                seek = Seek(user, game.variant, game.initial_fen, color, game.base, game.inc, game.skill_level, game.rated)
                                seeks[seek.id] = seek

                                response = accept_seek(seeks, games, opp_player, seek.id)
                                await ws.send_json(response)
                                await opp_ws.send_json(response)
                            else:
                                game.rematch_offers.add(user.username)
                                response = {"type": "rematch", "message": "Rematch offer sent"}
                                await ws.send_json(response)
                                await opp_ws.send_json(response)

                    elif data["type"] == "abort":
                        game = games[data["gameId"]]
                        response = game.abort()
                        await ws.send_json(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "draw":
                        response = draw(games, data)
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "resign":
                        response = resign(games, user, data)
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "flag":
                        response = flag(games, user, data)
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "get_seeks":
                        response = get_seeks(seeks)
                        await ws.send_json(response)

                    elif data["type"] == "create_ai_challenge":
                        variant = data["variant"]
                        if variant == "seirawan":
                            engine = users.get("Seirawan-Stockfish")
                        elif variant == "xiangqi":
                            engine = users.get("Elephant-Eye")
                        else:
                            engine = users.get("Fairy-Stockfish")

                        if engine is None or not engine.online:
                            continue

                        seek = Seek(user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"])
                        seeks[seek.id] = seek

                        response = accept_seek(seeks, games, engine, seek.id)
                        await ws.send_json(response)

                        await engine.event_queue.put(challenge(seek, response))
                        gameId = response["gameId"]
                        engine.game_queues[gameId] = asyncio.Queue()

                    elif data["type"] == "create_seek":
                        response = create_seek(seeks, user, data)
                        for client_ws in sockets.values():
                            if client_ws is not None:
                                await client_ws.send_json(response)

                    elif data["type"] == "delete_seek":
                        del seeks[data["seekID"]]
                        response = get_seeks(seeks)
                        for client_ws in sockets.values():
                            if client_ws is not None:
                                await client_ws.send_json(response)

                    elif data["type"] == "accept_seek":
                        seek = seeks[data["seekID"]]
                        response = accept_seek(seeks, games, user, data["seekID"])
                        await ws.send_json(response)

                        if seek.user.lobby_ws is not None:
                            await seek.user.lobby_ws.send_json(response)

                        if seek.user.is_bot:
                            await seek.user.event_queue.put(challenge(seek, response))
                            gameId = response["gameId"]
                            seek.user.game_queues[gameId] = asyncio.Queue()

                        # Inform others, accept-seek() deleted accepted seek allready.
                        response = get_seeks(seeks)
                        for client_ws in sockets.values():
                            if client_ws is not None:
                                await client_ws.send_json(response)

                    elif data["type"] == "lobby_user_connected":
                        user = users[session_user]
                        # update websocket
                        sockets[user.username] = ws
                        user.lobby_ws = ws

                        response = {"type": "lobby_user_connected", "username": user.username}
                        await ws.send_json(response)

                        loop = asyncio.get_event_loop()
                        loop.create_task(user.pinger(sockets, seeks))

                    elif data["type"] == "game_user_connected":
                        user = users[session_user]
                        # update websocket
                        user.game_sockets[data["gameId"]] = ws
                        response = {"type": "game_user_connected", "username": user.username, "gameId": data["gameId"]}
                        await ws.send_json(response)

                    elif data["type"] == "lobbychat":
                        user = users[session_user]
                        response = {"type": "lobbychat", "user": user.username, "message": data["message"]}
                        for client_ws in sockets.values():
                            if client_ws is not None:
                                await client_ws.send_json(response)

                    elif data["type"] == "roundchat":
                        user = users[session_user]
                        response = {"type": "roundchat", "user": user.username, "message": data["message"]}
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.is_bot:
                            await opp_player.game_queues[data["gameId"]].put('{"type": "chatLine", "username": "%s", "room": "spectator", "text": "%s"}\n' % (user.username, data["message"]))
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

            else:
                log.debug("type(msg.data) != str %s" % msg)
        elif msg.type == aiohttp.WSMsgType.ERROR:
            log.debug("!!! ws connection closed with exception %s" % ws.exception())
        else:
            log.debug("other msg.type %s %s" % (msg.type, msg))

    log.info("--- Websocket %s closed" % id(ws))

    await user.quit(sockets, seeks)

    return ws


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/", index),
    ("/tv", index),
    (r"/{gameId:\w{12}}", index),
    ("/ws", websocket_handler),
    ("/api/account", profile),
    ("/api/account/playing", playing),
    ("/api/stream/event", event_stream),
    ("/api/bot/game/stream/{gameId}", game_stream),
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
