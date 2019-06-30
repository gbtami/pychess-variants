import asyncio
import json
import logging
import warnings
import functools
import datetime
from urllib.parse import urlparse

import aiohttp
from aiohttp import web
import aioauth_client
import aiohttp_session

from settings import URI, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH
from bot_api import profile, playing, event_stream, game_stream, bot_abort,\
    bot_resign, bot_chat, bot_move, challenge_accept, challenge_decline,\
    create_bot_seek, challenge_create, bot_pong
from utils import get_seeks, create_seek, accept_seek, challenge, broadcast,\
    play_move, get_board, start, draw, resign, flag, User, Seek, STARTED, load_game


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
        raise web.HTTPFound(client.get_authorize_url(
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
        raise web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s %s %s" % (user.id, user.username, user.country))
    session["user_name"] = user.username
    session["country"] = user.country
    raise web.HTTPFound("/")


async def index(request):
    """ Create home html. """

    users = request.app["users"]
    games = request.app["games"]
    db = request.app["db"]

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    # Coming from login?
    if session_user is not None and "token" in session:
        doc = await db.user.find_one({"_id": session_user})
        if doc is None:
            result = await db.user.insert_one({"_id": session_user, "counry": session["country"]})
            print("db insert user result %s" % repr(result.inserted_id))
        del session["token"]

    session["last_visit"] = datetime.datetime.now().isoformat()
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

    gameId = request.match_info.get("gameId")

    # TODO: tv for @player and for variants
    tv = ""
    if request.path == "/tv" and len(games) > 0:
        tv = "standard"
        # TODO: get highest rated game
        gameId = list(games.keys())[-1]

    # Do we have gameId in request url?
    if gameId is not None:
        if gameId in games:
            game = games[gameId]
            if user.username != game.wplayer.username and user.username != game.bplayer.username:
                game.spectators.add(user)
        else:
            game = await load_game(db, games, users, gameId)
            if game is None:
                log.debug("Requseted game %s not in app['games']" % gameId)
                template = request.app["jinja"].get_template("404.html")
                return web.Response(
                    text=html_minify(template.render({"home": URI})), content_type="text/html")

    template = request.app["jinja"].get_template("index.html")
    render = {
        "app_name": "PyChess",
        "home": URI,
        "username": user.username if session["guest"] else "",
        "country": session["country"] if "country" in session else "",
        "guest": session["guest"],
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
    response = web.Response(text=html_minify(text), content_type="text/html")
    if not session["guest"]:
        hostname = urlparse(URI).hostname
        response.set_cookie("user", session["user_name"], domain=hostname, secure="." not in hostname, max_age=31536000)
    return response


async def websocket_handler(request):
    """ Handle incoming websocket messages.
        Get valid move destinations in initial FEN position or
        get opponent move + valid move destinations of given FEN.
    """

    users = request.app["users"]
    sockets = request.app["websockets"]
    seeks = request.app["seeks"]
    games = request.app["games"]
    db = request.app["db"]

    ws = web.WebSocketResponse()

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        raise web.HTTPFound("/")

    await ws.prepare(request)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users[session_user] if session_user else None
    lobby_ping_task = None
    log.debug("-------------------------- NEW WEBSOCKET by %s" % user)

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
                        await play_move(games, data)

                        board_response = get_board(games, data, full=False)
                        log.info("   Server send to %s: %s" % (user.username, board_response["fen"]))
                        await ws.send_json(board_response)

                        game = games[data["gameId"]]
                        if game.status > STARTED and user.bot:
                            await user.game_queues[data["gameId"]].put(game.game_end)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if opp_player.bot:
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
                        if opp_player.bot:
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
                                        response = await game.abort()
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
                        board_response = get_board(games, data, full=True)
                        log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
                        await ws.send_json(board_response)

                    elif data["type"] == "pong":
                        user.ping_counter -= 1

                    elif data["type"] == "rematch":
                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if opp_player.bot:
                            variant = game.variant
                            if variant == "seirawan":
                                engine = users.get("Seirawan-Stockfish")
                            elif variant == "xiangqi":
                                engine = users.get("Elephant-Eye")
                            else:
                                engine = users.get("Fairy-Stockfish")

                            if engine is None or not engine.online:
                                # TODO: message that engine is offline, but capture BOT will play instead
                                engine = users.get("Random-Mover")

                            color = "w" if game.wplayer.username == opp_name else "b"
                            seek = Seek(user, game.variant, game.initial_fen, color, game.base, game.inc, game.skill_level)
                            seeks[seek.id] = seek

                            response = await accept_seek(db, seeks, games, engine, seek.id)
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

                                response = await accept_seek(db, seeks, games, opp_player, seek.id)
                                await ws.send_json(response)
                                await opp_ws.send_json(response)
                            else:
                                game.rematch_offers.add(user.username)
                                response = {"type": "offer", "message": "Rematch offer sent"}
                                await ws.send_json(response)
                                await opp_ws.send_json(response)

                    elif data["type"] == "abort":
                        game = games[data["gameId"]]
                        response = await game.abort()
                        await ws.send_json(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "draw":
                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        response = await draw(games, data, agreement=opp_name in game.draw_offers)
                        await ws.send_json(response)

                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put(response)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if opp_name not in game.draw_offers:
                            game.draw_offers.add(user.username)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "resign":
                        game = games[data["gameId"]]
                        response = await resign(games, user, data)

                        await ws.send_json(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if game.spectators:
                            for spectator in game.spectators:
                                await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "flag":
                        response = await flag(games, user, data)
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
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
                            # TODO: message that engine is offline, but capture BOT will play instead
                            engine = users.get("Random-Mover")

                        seek = Seek(user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"])
                        seeks[seek.id] = seek

                        response = await accept_seek(db, seeks, games, engine, seek.id)
                        await ws.send_json(response)

                        gameId = response["gameId"]
                        engine.game_queues[gameId] = asyncio.Queue()
                        await engine.event_queue.put(challenge(seek, response))

                    elif data["type"] == "create_seek":
                        create_seek(seeks, user, data)
                        await broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "delete_seek":
                        del seeks[data["seekID"]]
                        del user.seeks[data["seekID"]]

                        await broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "accept_seek":
                        seek = seeks[data["seekID"]]
                        response = await accept_seek(db, seeks, games, user, data["seekID"])
                        await ws.send_json(response)

                        if seek.user.lobby_ws is not None:
                            await seek.user.lobby_ws.send_json(response)

                        if seek.user.bot:
                            await seek.user.event_queue.put(challenge(seek, response))
                            gameId = response["gameId"]
                            seek.user.game_queues[gameId] = asyncio.Queue()

                        # Inform others, accept-seek() deleted accepted seek allready.
                        await broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "lobby_user_connected":
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing lobby_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                user = User(username=data["username"])
                                users[user.username] = user
                                response = {"type": "lobbychat", "user": "", "message": "%s connected" % session_user}
                            else:
                                user = users[session_user]
                                response = {"type": "lobbychat", "user": "", "message": "%s connected" % session_user}
                        else:
                            log.info("+++ Existing lobby_user %s socket reconnected." % data["username"])
                            session_user = data["username"]
                            user = User(username=data["username"])
                            users[user.username] = user
                            response = {"type": "lobbychat", "user": "", "message": "%s reconnected" % session_user}
                        user.ping_counter = 0
                        user.online = True
                        await broadcast(sockets, response)

                        # update websocket
                        sockets[user.username] = ws
                        user.lobby_ws = ws

                        response = {"type": "lobby_user_connected", "username": user.username}
                        await ws.send_json(response)

                        loop = asyncio.get_event_loop()
                        lobby_ping_task = loop.create_task(user.pinger(sockets, seeks, users, games))

                    elif data["type"] == "game_user_connected":
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing game_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                user = User(username=data["username"])
                                users[user.username] = user
                            else:
                                user = users[session_user]
                        else:
                            log.info("+++ Existing game_user %s socket reconnected." % data["username"])
                            session_user = data["username"]
                            user = User(username=data["username"])
                            users[user.username] = user
                        user.ping_counter = 0
                        user.online = True

                        # update websocket
                        user.game_sockets[data["gameId"]] = ws

                        # remove user seeks
                        await user.clear_seeks(sockets, seeks)

                        game = games[data["gameId"]]
                        response = {"type": "game_user_connected", "username": user.username, "gameId": data["gameId"], "ply": game.ply}
                        await ws.send_json(response)

                    elif data["type"] == "is_user_online":
                        player_name = data["username"]
                        player = users.get(player_name)
                        if player is not None and player.online:
                            response = {"type": "user_online", "username": player_name}
                        else:
                            response = {"type": "user_disconnected", "username": player_name}
                        await ws.send_json(response)

                    elif data["type"] == "lobbychat":
                        response = {"type": "lobbychat", "user": user.username, "message": data["message"]}
                        await broadcast(sockets, response)

                    elif data["type"] == "roundchat":
                        response = {"type": "roundchat", "user": user.username, "message": data["message"]}
                        await ws.send_json(response)

                        game = games[data["gameId"]]
                        game.messages.append(data["message"])
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put('{"type": "chatLine", "username": "%s", "room": "spectator", "text": "%s"}\n' % (user.username, data["message"]))
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                    elif data["type"] == "updateTV":
                        keys = games.keys()
                        if len(keys) > 0:
                            gameId = list(keys)[-1]
                            if gameId != data["gameId"]:
                                response = {"type": "updateTV", "gameId": gameId}
                                await ws.send_json(response)

                    elif data["type"] == "disconnect":
                        # Used only to test socket disconnection...
                        await ws.close(code=1009)

            else:
                log.debug("type(msg.data) != str %s" % msg)
        elif msg.type == aiohttp.WSMsgType.ERROR:
            log.debug("!!! ws connection closed with exception %s" % ws.exception())
        else:
            log.debug("other msg.type %s %s" % (msg.type, msg))

    log.info("--- Websocket %s closed" % id(ws))

    if user.online:
        user.online = False
        if lobby_ping_task is not None:
            lobby_ping_task.cancel()

        log.info("--- %s went offline" % user.username)
        await user.broadcast_disconnect(users, games)
        await user.clear_seeks(sockets, seeks)
        await user.quit_lobby(sockets)

        response = {"type": "lobbychat", "user": "", "message": "%s disconnected" % session_user}
        await broadcast(sockets, response)

    return ws


get_routes = (
    ("/login", login),
    ("/oauth", oauth),
    ("/", index),
    ("/tv", index),
    (r"/{gameId:\w{8}}", index),
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
