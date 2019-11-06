import asyncio
import json
import logging
import random
import string
from datetime import datetime
from functools import partial

import aiohttp
from aiohttp import web
import aiohttp_session

from fairy import WHITE, BLACK
from utils import play_move, get_board, start, draw, game_ended, round_broadcast,\
    new_game, challenge, load_game, User, Seek, STARTED, DRAW, MyWebSocketResponse,\
    MORE_TIME, ANALYSIS

log = logging.getLogger(__name__)


async def round_socket_handler(request):

    users = request.app["users"]
    sockets = request.app["websockets"]
    seeks = request.app["seeks"]
    games = request.app["games"]

    ws = MyWebSocketResponse()

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        raise web.HTTPFound("/")

    await ws.prepare(request)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users[session_user] if session_user else None

    game_ping_task = None
    game = None
    opp_ws = None

    async def game_pinger():
        """ Prevent Heroku to close inactive ws """
        # TODO: use this to detect disconnected games?
        while not ws.closed:
            await ws.send_json({})
            await asyncio.sleep(5)

    log.debug("-------------------------- NEW round WEBSOCKET by %s" % user)

    async for msg in ws:
        if msg.type == aiohttp.WSMsgType.TEXT:
            if type(msg.data) == str:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                else:
                    data = json.loads(msg.data)
                    log.debug("Websocket (%s) message: %s" % (id(ws), msg))

                    if data["type"] == "move":
                        log.info("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
                        move_is_ok = await play_move(games, data)
                        if not move_is_ok:
                            message = "Something went wrong! Server can't accept move %s. Try another one, please!" % data["move"]
                            chat_response = {"type": "roundchat", "user": "_server", "message": message, "room": "player"}
                            await ws.send_json(chat_response)

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

                        await round_broadcast(game, users, board_response, channels=request.app["channels"])

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

                                response = {"type": "user_present", "username": opp_name}
                                await ws.send_json(response)

                    elif data["type"] == "board":
                        board_response = get_board(games, data, full=True)
                        log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
                        await ws.send_json(board_response)

                    elif data["type"] == "analysis":
                        game = await load_game(request.app, data["gameId"])

                        if game.variant == "xiangqi":
                            response = {"type": "roundchat", "user": "", "room": "spectator", "message": "Xiangqi analysis is not supported yet. "}
                            await ws.send_json(response)
                            continue

                        # If there is any fishnet client, use it.
                        if len(request.app["workers"]) > 0:
                            work_id = "".join(random.choice(string.ascii_letters + string.digits) for x in range(6))
                            work = {
                                "work": {
                                    "type": "analysis",
                                    "id": work_id,
                                },
                                # or:
                                # "work": {
                                #   "type": "move",
                                #   "id": "work_id",
                                #   "level": 5 // 1 to 8
                                # },
                                "username": data["username"],
                                "game_id": data["gameId"],  # optional
                                "position": game.board.initial_fen,  # start position (X-FEN)
                                "variant": game.variant,
                                "moves": " ".join(game.board.move_stack),  # moves of the game (UCI)
                                "nodes": 500000,  # optional limit
                                #  "skipPositions": [1, 4, 5]  # 0 is the first position
                            }
                            request.app["works"][work_id] = work
                            request.app["fishnet"].put_nowait((ANALYSIS, work_id))
                        else:
                            variant = game.variant
                            if variant == "xiangqi":
                                engine = users.get("Elephant-Eye")
                            else:
                                engine = users.get("Fairy-Stockfish")
                            if (engine is not None) and engine.online:
                                engine.game_queues[data["gameId"]] = asyncio.Queue()
                                await engine.event_queue.put(game.analysis_start(data["username"]))

                        response = {"type": "roundchat", "user": "", "room": "spectator", "message": "Analysis request sent..."}
                        await ws.send_json(response)

                    elif data["type"] == "rematch":
                        game = await load_game(request.app, data["gameId"])
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if opp_player.bot:
                            variant = game.variant
                            if opp_player.username == "Random-Mover":
                                engine = users.get("Random-Mover")
                            elif variant == "xiangqi":
                                engine = users.get("Elephant-Eye")
                            else:
                                engine = users.get("Fairy-Stockfish")

                            if engine is None or not engine.online:
                                # TODO: message that engine is offline, but capture BOT will play instead
                                engine = users.get("Random-Mover")

                            color = "w" if game.wplayer.username == opp_name else "b"
                            seek = Seek(user, game.variant, game.initial_fen, color, game.base, game.inc, game.level, game.rated, game.chess960)
                            seeks[seek.id] = seek

                            response = await new_game(request.app, engine, seek.id)
                            await ws.send_json(response)

                            await engine.event_queue.put(challenge(seek, response))
                            gameId = response["gameId"]
                            engine.game_queues[gameId] = asyncio.Queue()
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            if opp_name in game.rematch_offers:
                                color = "w" if game.wplayer.username == opp_name else "b"
                                seek = Seek(user, game.variant, game.initial_fen, color, game.base, game.inc, game.level, game.rated, game.chess960)
                                seeks[seek.id] = seek

                                response = await new_game(request.app, opp_player, seek.id)
                                await ws.send_json(response)
                                await opp_ws.send_json(response)
                            else:
                                game.rematch_offers.add(user.username)
                                response = {"type": "offer", "message": "Rematch offer sent", "room": "player", "user": ""}
                                game.messages.append(response)
                                await ws.send_json(response)
                                await opp_ws.send_json(response)

                    elif data["type"] == "draw":
                        game = games[data["gameId"]]
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        response = await draw(games, data, agreement=opp_name in game.draw_offers)
                        await ws.send_json(response)

                        if opp_player.bot:
                            if game.status == DRAW:
                                await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if opp_name not in game.draw_offers:
                            game.draw_offers.add(user.username)

                        await round_broadcast(game, users, response)

                    elif data["type"] in ("abort", "resign", "abandone", "flag"):
                        game = games[data["gameId"]]
                        response = await game_ended(games, user, data, data["type"])

                        await ws.send_json(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        await round_broadcast(game, users, response)

                    elif data["type"] == "game_user_connected":
                        game = await load_game(request.app, data["gameId"])
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing game_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                user = User(username=data["username"], anon=data["username"].startswith("Anonymous"))
                                users[user.username] = user

                                # Update logged in users as spactators
                                if user.username != game.wplayer.username and user.username != game.bplayer.username and game is not None:
                                    game.spectators.add(user)
                            else:
                                user = users[session_user]
                        else:
                            log.info("+++ Existing game_user %s socket reconnected." % data["username"])
                            session_user = data["username"]
                            user = User(username=data["username"], anon=data["username"].startswith("Anonymous"))
                            users[user.username] = user
                        user.ping_counter = 0

                        # update websocket
                        user.game_sockets[data["gameId"]] = ws

                        # remove user seeks
                        await user.clear_seeks(sockets, seeks)

                        if game is None:
                            log.debug("Requseted game %s not found!")
                            response = {"type": "game_not_found", "username": user.username, "gameId": data["gameId"]}
                            await ws.send_json(response)
                            continue
                        else:
                            games[data["gameId"]] = game
                            if user.username != game.wplayer.username and user.username != game.bplayer.username:
                                game.spectators.add(user)
                                response = {"type": "spectators", "spectators": ", ".join((spectator.username for spectator in game.spectators)), "gameId": data["gameId"]}
                                await round_broadcast(game, users, response, full=True)

                            response = {"type": "game_user_connected", "username": user.username, "gameId": data["gameId"], "ply": game.ply}
                            await ws.send_json(response)

                        response = {"type": "fullchat", "lines": list(game.messages)}
                        await ws.send_json(response, dumps=partial(json.dumps, default=datetime.isoformat))

                        loop = asyncio.get_event_loop()
                        game_ping_task = loop.create_task(game_pinger())
                        request.app["tasks"].add(game_ping_task)

                    elif data["type"] == "is_user_present":
                        player_name = data["username"]
                        player = users.get(player_name)
                        if player is not None and data["gameId"] in (player.game_queues if player.bot else player.game_sockets):
                            response = {"type": "user_present", "username": player_name}
                        else:
                            response = {"type": "user_disconnected", "username": player_name}
                        await ws.send_json(response)

                    elif data["type"] == "moretime":
                        # TODO: stop and update game stopwatch time with updated secs
                        game = games[data["gameId"]]

                        opp_color = WHITE if user.username == game.bplayer.username else BLACK
                        if opp_color == game.stopwatch.color:
                            opp_time = game.stopwatch.stop()
                            game.stopwatch.restart(opp_time + MORE_TIME)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if not opp_player.bot:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            response = {"type": "moretime"}
                            await opp_ws.send_json(response)

                    elif data["type"] == "roundchat":
                        response = {"type": "roundchat", "user": user.username, "message": data["message"], "room": data["room"]}
                        gameId = data["gameId"]
                        game = await load_game(request.app, gameId)
                        game.messages.append(response)

                        for name in (game.wplayer.username, game.bplayer.username):
                            player = users[name]
                            if player.bot:
                                if gameId in player.game_queues:
                                    await player.game_queues[gameId].put('{"type": "chatLine", "username": "%s", "room": "spectator", "text": "%s"}\n' % (user.username, data["message"]))
                            else:
                                if gameId in player.game_sockets:
                                    player_ws = player.game_sockets[gameId]
                                    await player_ws.send_json(response)

                        await round_broadcast(game, users, response)

                    elif data["type"] == "leave":
                        response = {"type": "roundchat", "user": "", "message": "%s left the game" % user.username, "room": "player"}
                        gameId = data["gameId"]
                        game = await load_game(request.app, gameId)
                        game.messages.append(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if not opp_player.bot and gameId in opp_player.game_sockets:
                            opp_player_ws = opp_player.game_sockets[gameId]
                            await opp_player_ws.send_json(response)

                            response = {"type": "user_disconnected", "username": user.username}
                            await opp_player_ws.send_json(response)

                        await round_broadcast(game, users, response)

                    elif data["type"] == "updateTV":
                        db = request.app["db"]
                        query_filter = {"us": data["profileId"]} if "profileId" in data and data["profileId"] != "" else {}
                        doc = await db.game.find_one(query_filter, sort=[('$natural', -1)])
                        gameId = None
                        if doc is not None:
                            gameId = doc["_id"]
                        if gameId != data["gameId"] and gameId is not None:
                            response = {"type": "updateTV", "gameId": gameId}
                            await ws.send_json(response)
            else:
                log.debug("type(msg.data) != str %s" % msg)
        elif msg.type == aiohttp.WSMsgType.ERROR:
            log.debug("!!! Round ws connection closed with exception %s" % ws.exception())
        else:
            log.debug("other msg.type %s %s" % (msg.type, msg))

    log.info("--- Round Websocket %s closed" % id(ws))

    if game is not None and opp_ws is not None:
        response = {"type": "user_disconnected", "username": user.username}
        await opp_ws.send_json(response)
        await round_broadcast(game, users, response)

    if game is not None and not user.bot:
        del user.game_sockets[game.id]

        if user.username != game.wplayer.username and user.username != game.bplayer.username:
            game.spectators.discard(user)
            response = {"type": "spectators", "spectators": ", ".join((spectator.username for spectator in game.spectators)), "gameId": game.id}
            await round_broadcast(game, users, response, full=True)

    if game_ping_task is not None:
        game_ping_task.cancel()

    return ws
