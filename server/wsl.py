import asyncio
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from broadcast import lobby_broadcast
from seek import challenge, create_seek, get_seeks, Seek
from user import User
from utils import new_game, MyWebSocketResponse

log = logging.getLogger(__name__)


async def lobby_socket_handler(request):

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
    user = users[session_user] if session_user is not None and session_user in users else None

    lobby_ping_task = None

    log.debug("-------------------------- NEW lobby WEBSOCKET by %s" % user)

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

                    if data["type"] == "pong":
                        user.ping_counter -= 1

                    elif data["type"] == "get_seeks":
                        response = get_seeks(seeks)
                        await ws.send_json(response)

                    elif data["type"] == "create_ai_challenge":
                        variant = data["variant"]
                        engine = users.get("Fairy-Stockfish")

                        if engine is None or not engine.online():
                            # TODO: message that engine is offline, but capture BOT will play instead
                            engine = users.get("Random-Mover")

                        seek = Seek(user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"], data["rated"], data["chess960"], data["handicap"])
                        # print("SEEK", user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"], False, data["chess960"])
                        seeks[seek.id] = seek

                        response = await new_game(request.app, engine, seek.id)
                        await ws.send_json(response)

                        gameId = response["gameId"]
                        engine.game_queues[gameId] = asyncio.Queue()
                        await engine.event_queue.put(challenge(seek, response))

                    elif data["type"] == "create_seek":
                        print("create_seek", data)
                        create_seek(seeks, user, data)
                        await lobby_broadcast(sockets, get_seeks(seeks))

                        if data.get("target"):
                            queue = users[data["target"]].notify_queue
                            if queue is not None:
                                await queue.put(json.dumps({"notify": "new_challenge"}))

                    elif data["type"] == "delete_seek":
                        del seeks[data["seekID"]]
                        del user.seeks[data["seekID"]]

                        await lobby_broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "accept_seek":
                        if data["seekID"] not in seeks:
                            continue

                        seek = seeks[data["seekID"]]
                        print("accept_seek", seek.as_json)
                        response = await new_game(request.app, user, data["seekID"])
                        await ws.send_json(response)

                        if seek.user.lobby_ws is not None:
                            await seek.user.lobby_ws.send_json(response)

                        if seek.user.bot:
                            gameId = response["gameId"]
                            seek.user.game_queues[gameId] = asyncio.Queue()
                            await seek.user.event_queue.put(challenge(seek, response))

                        # Inform others, new_game() deleted accepted seek allready.
                        await lobby_broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "lobby_user_connected":
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing lobby_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                                response = {"type": "lobbychat", "user": "", "message": "%s joined the lobby" % session_user}
                            else:
                                user = users[session_user]
                                response = {"type": "lobbychat", "user": "", "message": "%s joined the lobby" % session_user}
                        else:
                            log.info("+++ Existing lobby_user %s socket reconnected." % data["username"])
                            session_user = data["username"]
                            if session_user in users:
                                user = users[session_user]
                            else:
                                user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                users[user.username] = user
                            response = {"type": "lobbychat", "user": "", "message": "%s rejoined the lobby" % session_user}

                        user.ping_counter = 0
                        await lobby_broadcast(sockets, response)

                        # update websocket
                        sockets[user.username] = ws
                        user.lobby_ws = ws

                        response = {"type": "lobby_user_connected", "username": user.username}
                        await ws.send_json(response)

                        response = {"type": "fullchat", "lines": list(request.app["chat"])}
                        await ws.send_json(response)

                        loop = asyncio.get_event_loop()
                        lobby_ping_task = loop.create_task(user.pinger(sockets, seeks, users, games))
                        request.app["tasks"].add(lobby_ping_task)

                        # send game count
                        response = {"type": "g_cnt", "cnt": request.app["g_cnt"]}
                        await ws.send_json(response)

                        # send user count
                        if len(user.game_sockets) == 0:
                            # not connected to any game socket but connected to lobby socket
                            request.app["u_cnt"] += 1
                            response = {"type": "u_cnt", "cnt": request.app["u_cnt"]}
                            await lobby_broadcast(sockets, response)
                        else:
                            response = {"type": "u_cnt", "cnt": request.app["u_cnt"]}
                            await ws.send_json(response)

                    elif data["type"] == "lobbychat":
                        response = {"type": "lobbychat", "user": user.username, "message": data["message"]}
                        await lobby_broadcast(sockets, response)
                        request.app["chat"].append(response)

                    elif data["type"] == "logout":
                        await ws.close()

                    elif data["type"] == "disconnect":
                        # Used only to test socket disconnection...
                        await ws.close(code=1009)

            else:
                log.debug("type(msg.data) != str %s" % msg)
        elif msg.type == aiohttp.WSMsgType.ERROR:
            log.debug("!!! Lobby ws connection closed with exception %s" % ws.exception())
        else:
            log.debug("other msg.type %s %s" % (msg.type, msg))

    log.info("--- Lobby Websocket %s closed" % id(ws))

    if lobby_ping_task is not None:
        lobby_ping_task.cancel()
        if user is not None:
            await user.clear_seeks(sockets, seeks)
            # online user counter will be updated in quit_lobby also!
            await user.quit_lobby(sockets, disconnect=False)

    return ws
