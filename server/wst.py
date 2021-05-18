from datetime import datetime, timezone
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from broadcast import lobby_broadcast
from settings import ADMINS
from utils import MyWebSocketResponse
from user import User
from tournament import load_tournament

log = logging.getLogger(__name__)


async def tournament_socket_handler(request):

    users = request.app["users"]
    sockets = request.app["tourneysockets"]

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

    log.debug("-------------------------- NEW tournament WEBSOCKET by %s", user)

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

                    if data["type"] == "get_players":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            response = tournament.players_json(data["page"])
                            await ws.send_json(response)

                    if data["type"] == "get_games":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            response = tournament.games_json(data["player"])
                            await ws.send_json(response)

                    elif data["type"] == "join":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            tournament.join(user)
                            response = tournament.players_json((tournament.leaderboard.index(user) + 1) // 10)
                            await ws.send_json(response)

                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "pause":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            tournament.pause(user)
                            response = tournament.players_json()
                            await ws.send_json(response)

                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "withdraw":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            tournament.withdraw(user)
                            response = tournament.players_json()
                            await ws.send_json(response)

                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "tournament_user_connected":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing tournament_user %s socket connected as %s.", session_user, data["username"])
                                session_user = data["username"]
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                                # response = {"type": "lobbychat", "user": "", "message": "%s joined the lobby" % session_user}
                            else:
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                                # response = {"type": "lobbychat", "user": "", "message": "%s joined the lobby" % session_user}
                        else:
                            log.info("+++ Existing lobby_user %s socket reconnected.", data["username"])
                            session_user = data["username"]
                            if session_user in users:
                                user = users[session_user]
                            else:
                                user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                users[user.username] = user

                        # update websocket
                        user.tournament_sockets.add(ws)
                        user.update_online()

                        sockets[user.username] = user.tournament_sockets

                        now = datetime.now(timezone.utc)
                        response = {
                            "type": "tournament_user_connected",
                            "username": user.username,
                            "tstatus": tournament.status,
                            "ustatus": tournament.user_status(user),
                            "secondsToStart": (tournament.starts_at - now).total_seconds() if tournament.starts_at > now else 0,
                            "secondsToFinish": (tournament.finish - now).total_seconds() if tournament.starts_at < now else 0,
                        }
                        await ws.send_json(response)

                        response = {"type": "fullchat", "lines": list(request.app["chat"])}
                        await ws.send_json(response)

                    elif data["type"] == "lobbychat":
                        message = data["message"]
                        response = None

                        if user.username in ADMINS:
                            if message.startswith("/silence"):
                                spammer = data["message"].split()[-1]
                                if spammer in users:
                                    users[spammer].set_silence()
                                    response = {"type": "lobbychat", "user": "", "message": "%s was timed out 10 minutes for spamming the chat." % spammer}
                            else:
                                response = {"type": "lobbychat", "user": user.username, "message": data["message"]}
                        else:
                            if user.silence == 0:
                                response = {"type": "lobbychat", "user": user.username, "message": data["message"]}

                        if response is not None:
                            await lobby_broadcast(sockets, response)
                            request.app["chat"].append(response)

                    elif data["type"] == "logout":
                        await ws.close()

                    elif data["type"] == "disconnect":
                        # Used only to test socket disconnection...
                        await ws.close(code=1009)

            elif msg.type == aiohttp.WSMsgType.CLOSED:
                log.debug("--- Tournament websocket %s msg.type == aiohttp.WSMsgType.CLOSED", id(ws))
                break

            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error("--- Tournament ws %s msg.type == aiohttp.WSMsgType.ERROR", id(ws))
                break

            else:
                log.debug("--- Tournament ws other msg.type %s %s", msg.type, msg)

    except OSError:
        # disconnected
        pass

    except Exception:
        log.exception("ERROR: Exception in tournament_socket_handler() owned by %s ", session_user)

    finally:
        log.debug("--- wsl.py fianlly: await ws.close() %s", session_user)
        await ws.close()

        if user is not None:
            if ws in user.tournament_sockets:
                user.tournament_sockets.remove(ws)
                user.update_online()

            if len(user.tournament_sockets) == 0:
                if user.username in sockets:
                    del sockets[user.username]

    return ws
