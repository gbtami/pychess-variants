import asyncio
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from admin import silence
from broadcast import lobby_broadcast, discord_message, broadcast_streams
from chat import chat_response
from const import STARTED
from settings import ADMINS, TOURNAMENT_DIRECTORS
from seek import challenge, create_seek, get_seeks, Seek
from user import User
from utils import join_seek, load_game, online_count, MyWebSocketResponse, remove_seek
from misc import server_state
from tournament_spotlights import tournament_spotlights

log = logging.getLogger(__name__)


async def is_playing(request, user, ws):
    # Prevent users to start new games if they have an unfinished one
    if user.game_in_progress is not None:
        game = await load_game(request.app, user.game_in_progress)
        if (game is None) or game.status > STARTED:
            user.game_in_progress = None
            return False
        response = {"type": "game_in_progress", "gameId": user.game_in_progress}
        await ws.send_json(response)
        return True
    else:
        return False


async def lobby_socket_handler(request):

    users = request.app["users"]
    sockets = request.app["lobbysockets"]
    seeks = request.app["seeks"]
    db = request.app["db"]
    invites = request.app["invites"]
    twitch = request.app["twitch"]
    youtube = request.app["youtube"]
    lobbychat = request.app["lobbychat"]

    ws = MyWebSocketResponse(heartbeat=3.0, receive_timeout=10.0)

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        return web.HTTPFound("/")

    await ws.prepare(request)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users[session_user] if session_user is not None and session_user in users else None

    if (user is not None) and (not user.enabled):
        await ws.close()
        session.invalidate()
        return web.HTTPFound("/")

    log.debug("-------------------------- NEW lobby WEBSOCKET by %s", user)

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                else:
                    data = json.loads(msg.data)
                    if not data["type"] == "pong":
                        log.debug("Websocket (%s) message: %s", id(ws), msg)

                    if data["type"] == "get_seeks":
                        response = get_seeks(seeks)
                        await ws.send_json(response)

                    elif data["type"] == "create_ai_challenge":
                        no = await is_playing(request, user, ws)
                        if no:
                            continue

                        variant = data["variant"]
                        engine = users.get("Fairy-Stockfish")

                        if data["rm"] or (engine is None) or (not engine.online):
                            # TODO: message that engine is offline, but Random-Mover BOT will play instead
                            engine = users.get("Random-Mover")

                        seek = Seek(
                            user,
                            variant,
                            fen=data["fen"],
                            color=data["color"],
                            base=data["minutes"],
                            inc=data["increment"],
                            byoyomi_period=data["byoyomiPeriod"],
                            level=0 if data["rm"] else data["level"],
                            player1=user,
                            rated=False,
                            chess960=data["chess960"],
                            alternate_start=data["alternateStart"],
                        )
                        # print("SEEK", user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"], False, data["chess960"])
                        seeks[seek.id] = seek

                        response = await join_seek(request.app, engine, seek.id)
                        await ws.send_json(response)

                        if response["type"] != "error":
                            gameId = response["gameId"]
                            engine.game_queues[gameId] = asyncio.Queue()
                            await engine.event_queue.put(challenge(seek, response))

                    elif data["type"] == "create_seek":
                        no = await is_playing(request, user, ws)
                        if no:
                            continue

                        print("create_seek", data)
                        seek = await create_seek(db, invites, seeks, user, data, ws)
                        await lobby_broadcast(sockets, get_seeks(seeks))
                        await discord_message(request.app, "create_seek", seek.discord_msg)

                    elif data["type"] == "create_invite":
                        no = await is_playing(request, user, ws)
                        if no:
                            continue

                        print("create_invite", data)
                        seek = await create_seek(db, invites, seeks, user, data, ws)

                        response = {"type": "invite_created", "gameId": seek.game_id}
                        await ws.send_json(response)

                    elif data["type"] == "create_host":
                        no = user.username not in TOURNAMENT_DIRECTORS
                        if no:
                            continue

                        print("create_host", data)
                        seek = await create_seek(db, invites, seeks, user, data, ws, True)

                        response = {"type": "host_created", "gameId": seek.game_id}
                        await ws.send_json(response)

                    elif data["type"] == "delete_seek":
                        try:
                            seek = seeks[data["seekID"]]
                            if seek.game_id is not None:
                                # delete game invite
                                del invites[seek.game_id]
                            del seeks[data["seekID"]]
                            del user.seeks[data["seekID"]]
                        except KeyError:
                            # Seek was already deleted
                            pass
                        await lobby_broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "accept_seek":
                        no = await is_playing(request, user, ws)
                        if no:
                            continue

                        if data["seekID"] not in seeks:
                            continue

                        seek = seeks[data["seekID"]]
                        # print("accept_seek", seek.as_json)
                        response = await join_seek(request.app, user, data["seekID"])
                        await ws.send_json(response)

                        if seek.creator.bot:
                            gameId = response["gameId"]
                            seek.creator.game_queues[gameId] = asyncio.Queue()
                            await seek.creator.event_queue.put(challenge(seek, response))
                        else:
                            if seek.ws is None:
                                remove_seek(seeks, seek)
                                await lobby_broadcast(sockets, get_seeks(seeks))
                            else:
                                await seek.ws.send_json(response)

                        # Inform others, new_game() deleted accepted seek allready.
                        await lobby_broadcast(sockets, get_seeks(seeks))

                    elif data["type"] == "lobby_user_connected":
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info(
                                    "+++ Existing lobby_user %s socket connected as %s.",
                                    session_user,
                                    data["username"],
                                )
                                session_user = data["username"]
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(
                                        request.app,
                                        username=data["username"],
                                        anon=data["username"].startswith("Anon-"),
                                    )
                                    users[user.username] = user
                            else:
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(
                                        request.app,
                                        username=data["username"],
                                        anon=data["username"].startswith("Anon-"),
                                    )
                                    users[user.username] = user
                        else:
                            log.info(
                                "+++ Existing lobby_user %s socket reconnected.",
                                data["username"],
                            )
                            session_user = data["username"]
                            if session_user in users:
                                user = users[session_user]
                            else:
                                user = User(
                                    request.app,
                                    username=data["username"],
                                    anon=data["username"].startswith("Anon-"),
                                )
                                users[user.username] = user

                        # update websocket
                        user.lobby_sockets.add(ws)
                        user.update_online()
                        sockets[user.username] = user.lobby_sockets

                        response = {
                            "type": "lobby_user_connected",
                            "username": user.username,
                        }
                        await ws.send_json(response)

                        response = {"type": "fullchat", "lines": list(lobbychat)}
                        await ws.send_json(response)

                        # send game count
                        response = {"type": "g_cnt", "cnt": request.app["g_cnt"][0]}
                        await ws.send_json(response)

                        # send user count
                        response = {"type": "u_cnt", "cnt": online_count(users)}
                        if len(user.game_sockets) == 0:
                            await lobby_broadcast(sockets, response)
                        else:
                            await ws.send_json(response)

                        spotlights = tournament_spotlights(request.app["tournaments"])
                        if len(spotlights) > 0:
                            await ws.send_json({"type": "spotlights", "items": spotlights})

                        streams = twitch.live_streams + youtube.live_streams
                        if len(streams) > 0:
                            await ws.send_json({"type": "streams", "items": streams})

                    elif data["type"] == "lobbychat":
                        if user.username.startswith("Anon-"):
                            continue

                        message = data["message"]
                        response = None

                        if user.username in ADMINS:
                            if message.startswith("/silence"):
                                response = silence(message, lobbychat, users)
                                # silence message was already added to lobbychat in silence()

                            elif message.startswith("/stream"):
                                parts = message.split()
                                if len(parts) >= 3:
                                    if parts[1] == "add":
                                        if len(parts) >= 5:
                                            youtube.add(parts[2], parts[3], parts[4])
                                        elif len(parts) >= 4:
                                            youtube.add(parts[2], parts[3])
                                        else:
                                            youtube.add(parts[2])
                                    elif parts[1] == "remove":
                                        youtube.remove(parts[2])
                                    await broadcast_streams(request.app)

                            elif message == "/state":
                                server_state(request.app)

                            else:
                                response = chat_response(
                                    "lobbychat", user.username, data["message"]
                                )
                                lobbychat.append(response)

                        elif user.anon and user.username != "Discord-Relay":
                            pass

                        else:
                            if user.silence == 0:
                                response = chat_response(
                                    "lobbychat", user.username, data["message"]
                                )
                                lobbychat.append(response)

                        if response is not None:
                            await lobby_broadcast(sockets, response)

                    elif data["type"] == "logout":
                        await ws.close()

                    elif data["type"] == "disconnect":
                        # Used only to test socket disconnection...
                        await ws.close(code=1009)

            elif msg.type == aiohttp.WSMsgType.CLOSED:
                log.debug(
                    "--- Lobby websocket %s msg.type == aiohttp.WSMsgType.CLOSED",
                    id(ws),
                )
                break

            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error("--- Lobby ws %s msg.type == aiohttp.WSMsgType.ERROR", id(ws))
                break

            else:
                log.debug("--- Lobby ws other msg.type %s %s", msg.type, msg)

    except OSError:
        # disconnected
        pass

    except Exception:
        log.exception("ERROR: Exception in lobby_socket_handler() owned by %s ", session_user)

    finally:
        log.debug("--- wsl.py fianlly: await ws.close() %s", session_user)
        await ws.close()

        if user is not None:
            if ws in user.lobby_sockets:
                user.lobby_sockets.remove(ws)
                user.update_online()

            # online user counter will be updated in quit_lobby also!
            if len(user.lobby_sockets) == 0:
                if user.username in sockets:
                    del sockets[user.username]

                # not connected to lobby socket and not connected to game socket
                if len(user.game_sockets) == 0:
                    response = {"type": "u_cnt", "cnt": online_count(users)}
                    await lobby_broadcast(sockets, response)

                # response = {"type": "lobbychat", "user": "", "message": "%s left the lobby" % user.username}
                # await lobby_broadcast(sockets, response)

                await user.clear_seeks()

    return ws
