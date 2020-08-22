import asyncio
import concurrent
import json
import logging
import random
import string

import aiohttp
from aiohttp import web
from aiohttp.web import WebSocketResponse
import aiohttp_session

from broadcast import lobby_broadcast, round_broadcast
from const import ANALYSIS, STARTED
from fairy import WHITE, BLACK
from seek import challenge, Seek
from user import User
from utils import analysis_move, play_move, draw, new_game, load_game, tv_game, tv_game_user, online_count

log = logging.getLogger(__name__)

MORE_TIME = 15 * 1000


async def round_socket_handler(request):

    users = request.app["users"]
    sockets = request.app["lobbysockets"]
    seeks = request.app["seeks"]
    games = request.app["games"]
    db = request.app["db"]

    ws = WebSocketResponse(heartbeat=3.0, receive_timeout=10.0)

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        raise web.HTTPFound("/")

    await ws.prepare(request)

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users[session_user] if session_user is not None and session_user in users else None

    game = None
    opp_ws = None

    log.debug("-------------------------- NEW round WEBSOCKET by %s" % user)

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                else:
                    data = json.loads(msg.data)
                    # log.debug("Websocket (%s) message: %s" % (id(ws), msg))

                    if data["type"] == "move":
                        # log.info("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
                        game = await load_game(request.app, data["gameId"])
                        move = data["move"]
                        await play_move(request.app, user, game, move, data["clocks"], data["ply"])

                    elif data["type"] == "analysis_move":
                        game = await load_game(request.app, data["gameId"])
                        await analysis_move(request.app, user, game, data["move"], data["fen"], data["ply"])

                    elif data["type"] == "ready":
                        game = await load_game(request.app, data["gameId"])
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            # Janggi game start have to wait for human player setup!
                            if game.variant != "janggi" or not (game.bsetup or game.wsetup):
                                await opp_player.event_queue.put(game.game_start)

                            response = {"type": "gameStart", "gameId": data["gameId"]}
                            await ws.send_json(response)
                        else:
                            response = {"type": "gameStart", "gameId": data["gameId"]}
                            await ws.send_json(response)

                            response = {"type": "user_present", "username": user.username}
                            await round_broadcast(game, users, game.spectator_list, full=True)

                    elif data["type"] == "board":
                        game = await load_game(request.app, data["gameId"])
                        if game.variant == "janggi":
                            if (game.bsetup or game.wsetup) and game.status <= STARTED:
                                if game.bsetup:
                                    await ws.send_json({"type": "setup", "color": "black", "fen": game.board.initial_fen})
                                elif game.wsetup:
                                    await ws.send_json({"type": "setup", "color": "white", "fen": game.board.initial_fen})
                            else:
                                board_response = game.get_board(full=True)
                                await ws.send_json(board_response)
                        else:
                            board_response = game.get_board(full=True)
                            await ws.send_json(board_response)

                    elif data["type"] == "setup":
                        # Janggi game starts with a prelude phase to set up horses and elephants
                        # First the second player (Red) choses his setup! Then the first player (Blue)
                        game = await load_game(request.app, data["gameId"])
                        game.board.initial_fen = data["fen"]
                        game.initial_fen = game.board.initial_fen
                        game.board.fen = game.board.initial_fen
                        # print("--- Got FEN from %s %s" % (data["color"], data["fen"]))

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        game.steps[0]["fen"] = data["fen"]
                        game.set_dests()

                        if data["color"] == "black":
                            game.bsetup = False
                            response = {"type": "setup", "color": "white", "fen": data["fen"]}
                            await ws.send_json(response)

                            if opp_player.bot:
                                game.board.janggi_setup("w")
                                game.steps[0]["fen"] = game.board.initial_fen
                                game.set_dests()
                            else:
                                opp_ws = users[opp_name].game_sockets[data["gameId"]]
                                await opp_ws.send_json(response)
                        else:
                            game.wsetup = False
                            response = game.get_board(full=True)
                            # log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
                            await ws.send_json(response)

                            if not opp_player.bot:
                                opp_ws = users[opp_name].game_sockets[data["gameId"]]
                                await opp_ws.send_json(response)

                        if opp_player.bot:
                            await opp_player.event_queue.put(game.game_start)

                    elif data["type"] == "analysis":
                        game = await load_game(request.app, data["gameId"])

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
                                "chess960": game.chess960,
                                "moves": " ".join(game.board.move_stack),  # moves of the game (UCI)
                                "nodes": 500000,  # optional limit
                                #  "skipPositions": [1, 4, 5]  # 0 is the first position
                            }
                            request.app["works"][work_id] = work
                            request.app["fishnet"].put_nowait((ANALYSIS, work_id))
                        else:
                            engine = users.get("Fairy-Stockfish")

                            if (engine is not None) and engine.online():
                                engine.game_queues[data["gameId"]] = asyncio.Queue()
                                await engine.event_queue.put(game.analysis_start(data["username"]))

                        response = {"type": "roundchat", "user": "", "room": "spectator", "message": "Analysis request sent..."}
                        await ws.send_json(response)

                    elif data["type"] == "rematch":
                        game = await load_game(request.app, data["gameId"])

                        if game is None:
                            log.debug("Requested game %s not found!")
                            response = {"type": "game_not_found", "username": user.username, "gameId": data["gameId"]}
                            await ws.send_json(response)
                            continue

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        handicap = data["handicap"]
                        fen = "" if game.variant == "janggi" else game.initial_fen

                        if opp_player.bot:
                            if opp_player.username == "Random-Mover":
                                engine = users.get("Random-Mover")
                            else:
                                engine = users.get("Fairy-Stockfish")

                            if engine is None or not engine.online():
                                # TODO: message that engine is offline, but capture BOT will play instead
                                engine = users.get("Random-Mover")

                            color = "w" if game.wplayer.username == opp_name else "b"
                            if handicap:
                                color = "w" if color == "b" else "b"
                            seek = Seek(
                                user, game.variant,
                                fen=fen,
                                color=color,
                                base=game.base,
                                inc=game.inc,
                                byoyomi_period=game.byoyomi_period,
                                level=game.level,
                                rated=game.rated,
                                chess960=game.chess960)
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
                                if handicap:
                                    color = "w" if color == "b" else "b"
                                seek = Seek(
                                    user, game.variant,
                                    fen=fen,
                                    color=color,
                                    base=game.base,
                                    inc=game.inc,
                                    byoyomi_period=game.byoyomi_period,
                                    level=game.level,
                                    rated=game.rated,
                                    chess960=game.chess960)
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
                        game = await load_game(request.app, data["gameId"])
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        response = await draw(games, data, agreement=opp_name in game.draw_offers)
                        await ws.send_json(response)
                        if opp_player.bot:
                            if game.status > STARTED:
                                await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            await opp_ws.send_json(response)

                        if opp_name not in game.draw_offers:
                            game.draw_offers.add(user.username)

                        await round_broadcast(game, users, response)

                    elif data["type"] == "logout":
                        await ws.close()

                    elif data["type"] == "byoyomi":
                        game = await load_game(request.app, data["gameId"])
                        game.byo_correction += game.inc * 1000
                        game.byoyomi_periods[0 if data["color"] == "white" else 1] = data["period"]
                        # print("BYOYOMI:", data)

                    elif data["type"] in ("abort", "resign", "abandone", "flag"):
                        game = await load_game(request.app, data["gameId"])
                        if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
                            continue

                        response = await game.game_ended(user, data["type"])

                        await ws.send_json(response)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        if opp_player.bot:
                            await opp_player.game_queues[data["gameId"]].put(game.game_end)
                        else:
                            if data["gameId"] in users[opp_name].game_sockets:
                                opp_ws = users[opp_name].game_sockets[data["gameId"]]
                                await opp_ws.send_json(response)

                        await round_broadcast(game, users, response)

                    elif data["type"] == "game_user_connected":
                        game = await load_game(request.app, data["gameId"])
                        if session_user is not None:
                            if data["username"] and data["username"] != session_user:
                                log.info("+++ Existing game_user %s socket connected as %s." % (session_user, data["username"]))
                                session_user = data["username"]
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user

                                # Update logged in users as spactators
                                if user.username != game.wplayer.username and user.username != game.bplayer.username and game is not None:
                                    game.spectators.add(user)
                            else:
                                if session_user in users:
                                    user = users[session_user]
                                else:
                                    user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                    users[user.username] = user
                        else:
                            log.info("+++ Existing game_user %s socket reconnected." % data["username"])
                            session_user = data["username"]
                            if session_user in users:
                                user = users[session_user]
                            else:
                                user = User(request.app, username=data["username"], anon=data["username"].startswith("Anon-"))
                                users[user.username] = user
                        user.ping_counter = 0

                        # update websocket
                        if data["gameId"] in user.game_sockets:
                            await user.game_sockets[data["gameId"]].close()
                        user.game_sockets[data["gameId"]] = ws

                        # remove user seeks
                        if len(user.lobby_sockets) == 0 or (
                                game.status <= STARTED and (user.username == game.wplayer.username or user.username == game.bplayer.username)):
                            await user.clear_seeks(sockets, seeks)

                        if game is None:
                            log.debug("Requested game %s not found!")
                            response = {"type": "game_not_found", "username": user.username, "gameId": data["gameId"]}
                            await ws.send_json(response)
                            continue
                        else:
                            games[data["gameId"]] = game
                            if user.username != game.wplayer.username and user.username != game.bplayer.username:
                                game.spectators.add(user)
                                await round_broadcast(game, users, game.spectator_list, full=True)

                            response = {"type": "game_user_connected", "username": user.username, "gameId": data["gameId"], "ply": game.board.ply}
                            await ws.send_json(response)

                        response = {"type": "crosstable", "ct": game.crosstable}
                        await ws.send_json(response)

                        response = {"type": "fullchat", "lines": list(game.messages)}
                        await ws.send_json(response)

                        response = {"type": "user_present", "username": user.username}
                        await round_broadcast(game, users, response, full=True)

                        # not connected to lobby socket but connected to game socket
                        if len(user.game_sockets) == 1 and user.username not in sockets:
                            response = {"type": "u_cnt", "cnt": online_count(users)}
                            await lobby_broadcast(sockets, response)

                    elif data["type"] == "is_user_present":
                        player_name = data["username"]
                        player = users.get(player_name)
                        await asyncio.sleep(1)
                        if player is not None and data["gameId"] in (player.game_queues if player.bot else player.game_sockets):
                            response = {"type": "user_present", "username": player_name}
                        else:
                            response = {"type": "user_disconnected", "username": player_name}
                        await ws.send_json(response)

                    elif data["type"] == "moretime":
                        # TODO: stop and update game stopwatch time with updated secs
                        game = await load_game(request.app, data["gameId"])

                        opp_color = WHITE if user.username == game.bplayer.username else BLACK
                        if opp_color == game.stopwatch.color:
                            opp_time = game.stopwatch.stop()
                            game.stopwatch.restart(opp_time + MORE_TIME)

                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]

                        if not opp_player.bot:
                            opp_ws = users[opp_name].game_sockets[data["gameId"]]
                            response = {"type": "moretime", "username": opp_name}
                            await opp_ws.send_json(response)
                            await round_broadcast(game, users, response)

                    elif data["type"] == "roundchat":
                        gameId = data["gameId"]
                        game = await load_game(request.app, gameId)
                        if data["message"] == "!analysis" and user.username in request.app["fishnet_versions"]:
                            for step in game.steps:
                                if "analysis" in step:
                                    del step["analysis"]
                            await ws.send_json({"type": "request_analysis"})
                            continue

                        response = {"type": "roundchat", "user": user.username, "message": data["message"], "room": data["room"]}
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
                        if "profileId" in data and data["profileId"] != "":
                            gameId = await tv_game_user(db, users, data["profileId"])
                        else:
                            gameId = await tv_game(db, request.app)

                        if gameId != data["gameId"] and gameId is not None:
                            response = {"type": "updateTV", "gameId": gameId}
                            await ws.send_json(response)

                    elif data["type"] == "count":

                        game = await load_game(request.app, data["gameId"])
                        cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
                        opp_name = game.wplayer.username if user.username == game.bplayer.username else game.bplayer.username
                        opp_player = users[opp_name]
                        opp_ws = users[opp_name].game_sockets[data["gameId"]]

                        if user.username == cur_player.username:
                            if data["mode"] == "start":
                                game.start_manual_count()
                                response = {"type": "count", "message": "Board's honor counting started", "room": "player", "user": ""}
                                await ws.send_json(response)
                                await opp_ws.send_json(response)
                                await round_broadcast(game, users, response)
                            elif data["mode"] == "stop":
                                game.stop_manual_count()
                                response = {"type": "count", "message": "Board's honor counting stopped", "room": "player", "user": ""}
                                await ws.send_json(response)
                                await opp_ws.send_json(response)
                                await round_broadcast(game, users, response)
                        else:
                            response = {"type": "count", "message": "You can only start/stop board's honor counting on your own turn!", "room": "player", "user": ""}
                            await ws.send_json(response)

            elif msg.type == aiohttp.WSMsgType.CLOSED:
                log.debug("--- Round websocket %s msg.type == aiohttp.WSMsgType.CLOSED" % id(ws))
                break

            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error("--- Round ws %s msg.type == aiohttp.WSMsgType.ERROR" % id(ws))
                break

            else:
                log.debug("--- Round ws other msg.type %s %s" % (msg.type, msg))
    except concurrent.futures._base.CancelledError:
        # client disconnected
        pass
    except Exception as e:
        log.error("!!! Round ws exception occured: %s" % type(e))

    finally:
        log.debug("---fianlly: await ws.close()")
        await ws.close()

    if game is not None and not user.bot:
        if game.id in user.game_sockets:
            del user.game_sockets[game.id]

        if user.username != game.wplayer.username and user.username != game.bplayer.username:
            game.spectators.discard(user)
            await round_broadcast(game, users, game.spectator_list, full=True)

        # not connected to lobby socket and not connected to game socket
        if len(user.game_sockets) == 0 and user.username not in sockets:
            response = {"type": "u_cnt", "cnt": online_count(users)}
            await lobby_broadcast(sockets, response)

    if game is not None:
        response = {"type": "user_disconnected", "username": user.username}
        await round_broadcast(game, users, response, full=True)

    return ws
