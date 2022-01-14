from datetime import datetime, timezone
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from admin import silence
from chat import chat_response
from const import STARTED
from settings import ADMINS
from utils import MyWebSocketResponse, online_count
from user import User
from tournaments import load_tournament
from tournament import T_CREATED, T_STARTED
from broadcast import lobby_broadcast


log = logging.getLogger(__name__)


async def tournament_socket_handler(request):

    users = request.app["users"]
    sockets = request.app["tourneysockets"]
    lobby_sockets = request.app["lobbysockets"]
    tourneychat = request.app["tourneychat"]

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
                            page = data["page"]
                            if user in tournament.players and tournament.players[user].page != page:
                                tournament.players[user].page = page
                            response = tournament.players_json(page=page)
                            await ws.send_json(response)

                    elif data["type"] == "my_page":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            if user in tournament.players:
                                # force to get users current page by leaderbord status
                                tournament.players[user].page = -1
                            response = tournament.players_json(user=user)
                            await ws.send_json(response)

                    elif data["type"] == "get_games":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            response = tournament.games_json(data["player"])
                            await ws.send_json(response)

                    elif data["type"] == "join":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            await tournament.join(user)
                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "pause":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            await tournament.pause(user)
                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "withdraw":
                        tournament = await load_tournament(request.app, data["tournamentId"])
                        if tournament is not None:
                            await tournament.withdraw(user)
                            response = {"type": "ustatus", "username": user.username, "ustatus": tournament.user_status(user)}
                            await ws.send_json(response)

                    elif data["type"] == "tournament_user_connected":
                        tournamentId = data["tournamentId"]
                        tournament = await load_tournament(request.app, tournamentId)
                        if tournament is None:
                            continue

                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing tournament_user %s socket connected as %s.", session_user, data["username"])
                                session_user = data["username"]
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                            else:
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                        else:
                            log.info("+++ Existing lobby_user %s socket reconnected.", data["username"])
                            session_user = data["username"]
                            if session_user in users:
                                user = users[session_user]
                            else:
                                user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                users[user.username] = user

                        # update websocket
                        if tournamentId not in user.tournament_sockets:
                            user.tournament_sockets[tournamentId] = set()
                        user.tournament_sockets[tournamentId].add(ws)

                        user.update_online()

                        sockets[tournamentId][user.username] = user.tournament_sockets[tournamentId]

                        now = datetime.now(timezone.utc)
                        response = {
                            "type": "tournament_user_connected",
                            "username": user.username,
                            "ustatus": tournament.user_status(user),
                            "urating": tournament.user_rating(user),
                            "tstatus": tournament.status,
                            "tsystem": tournament.system,
                            "tminutes": tournament.minutes,
                            "startsAt": tournament.starts_at.isoformat(),
                            "startFen": tournament.fen,
                            "description": tournament.description,
                            "frequency": tournament.frequency,
                            "secondsToStart": (tournament.starts_at - now).total_seconds() if tournament.starts_at > now else 0,
                            "secondsToFinish": (tournament.ends_at - now).total_seconds() if tournament.starts_at < now else 0,
                        }
                        await ws.send_json(response)

                        if (tournament.top_game is not None) and (tournament.top_game.status <= STARTED):
                            await ws.send_json(tournament.top_game_json)

                        if tournament.status > T_STARTED:
                            await ws.send_json(tournament.summary)

                        response = {"type": "fullchat", "lines": list(tourneychat[tournamentId])}
                        await ws.send_json(response)

                        if user.username not in tournament.spectators:
                            tournament.spactator_join(user)
                            await tournament.broadcast(tournament.spectator_list)

                        if len(user.game_sockets) == 0 and len(user.lobby_sockets) == 0:
                            response = {"type": "u_cnt", "cnt": online_count(users)}
                            await lobby_broadcast(lobby_sockets, response)

                    elif data["type"] == "lobbychat":
                        tournamentId = data["tournamentId"]
                        tournament = await load_tournament(request.app, tournamentId)
                        message = data["message"]
                        response = None

                        if user.username in ADMINS:
                            if message.startswith("/silence"):
                                response = silence(message, tourneychat[tournamentId], users)
                            elif message.startswith("/abort"):
                                if tournament.status in (T_CREATED, T_STARTED):
                                    await tournament.abort()
                            else:
                                response = chat_response("lobbychat", user.username, data["message"])
                        else:
                            if user.silence == 0:
                                response = chat_response("lobbychat", user.username, data["message"])

                        if response is not None:
                            await tournament.broadcast(response)
                            tourneychat[tournamentId].append(response)

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
            for tournamentId in user.tournament_sockets:
                if ws in user.tournament_sockets[tournamentId]:
                    user.tournament_sockets[tournamentId].remove(ws)

                    if len(user.tournament_sockets[tournamentId]) == 0:
                        del user.tournament_sockets[tournamentId]
                        user.update_online()

                        if tournamentId in sockets and user.username in sockets[tournamentId]:
                            del sockets[tournamentId][user.username]
                            tournament = await load_tournament(request.app, tournamentId)
                            tournament.spactator_leave(user)
                            await tournament.broadcast(tournament.spectator_list)

                        if not user.online:
                            response = {"type": "u_cnt", "cnt": online_count(users)}
                            await lobby_broadcast(lobby_sockets, response)
                    break

    return ws