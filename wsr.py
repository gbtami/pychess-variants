import asyncio
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from utils import play_move, get_board, start, draw, resign, flag, \
    accept_seek, challenge, load_game, User, Seek, STARTED

log = logging.getLogger(__name__)


async def round_socket_handler(request):

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

    game_ping_task = None

    async def game_pinger():
        """ Prevent Heroku to close inactive ws """
        while True:
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

                    elif data["type"] == "rematch":
                        game = await load_game(db, games, users, data["gameId"])
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
                                if data["gameId"] in users[spectator.username].game_sockets:
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
                                if data["gameId"] in users[spectator.username].game_sockets:
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
                                if data["gameId"] in users[spectator.username].game_sockets:
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
                                if data["gameId"] in users[spectator.username].game_sockets:
                                    await users[spectator.username].game_sockets[data["gameId"]].send_json(response)

                    elif data["type"] == "game_user_connected":
                        game = await load_game(db, games, users, data["gameId"])
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing game_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                user = User(username=data["username"])
                                users[user.username] = user

                                # Update logged in users as spactators
                                if user.username != game.wplayer.username and user.username != game.bplayer.username and game is not None:
                                    game.spectators.add(user)
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

                        if game is None:
                            log.debug("Requseted game %s not found!")
                            response = {"type": "game_not_found", "username": user.username, "gameId": data["gameId"]}
                            await ws.send_json(response)
                        else:
                            games[data["gameId"]] = game
                            if user.username != game.wplayer.username and user.username != game.bplayer.username:
                                game.spectators.add(user)

                            response = {"type": "game_user_connected", "username": user.username, "gameId": data["gameId"], "ply": game.ply}
                            await ws.send_json(response)

                        loop = asyncio.get_event_loop()
                        game_ping_task = loop.create_task(game_pinger())

                    elif data["type"] == "is_user_online":
                        player_name = data["username"]
                        player = users.get(player_name)
                        if player is not None and player.online:
                            response = {"type": "user_online", "username": player_name}
                        else:
                            response = {"type": "user_disconnected", "username": player_name}
                        await ws.send_json(response)

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

    if game_ping_task is not None:
        game_ping_task.cancel()

    return ws
