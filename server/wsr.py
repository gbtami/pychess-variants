import asyncio
import json
import logging
import random
import string

import aiohttp
from aiohttp import web
import aiohttp_session

import game
from typedefs import (
    db_key,
    fishnet_queue_key,
    fishnet_versions_key,
    fishnet_works_key,
    lobbysockets_key,
    seeks_key,
    users_key,
    workers_key,
)

from broadcast import lobby_broadcast, round_broadcast
from chat import chat_response
from const import ANON_PREFIX, ANALYSIS, STARTED
from fairy import WHITE, BLACK
from seek import challenge, Seek
from draw import draw, reject_draw
from utils import (
    analysis_move,
    play_move,
    join_seek,
    load_game,
    tv_game,
    tv_game_user,
    online_count,
    MyWebSocketResponse,
)

log = logging.getLogger(__name__)

MORE_TIME = 15 * 1000


async def round_socket_handler(request):
    app = request.app;
    users = app[users_key]

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await users.get(session_user)

    if user is not None and not user.enabled:
        session.invalidate()
        return web.HTTPFound("/")

    db = app[db_key]

    ws = MyWebSocketResponse(heartbeat=3.0, receive_timeout=15.0)

    ws_ready = ws.can_prepare(request)
    if not ws_ready.ok:
        return web.HTTPFound("/")

    await ws.prepare(request)

    game = None

    log.info("--- NEW round WEBSOCKET %s by %s from %s", id(ws), session_user, request.remote)

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                if msg.data == "close":
                    log.debug("Got 'close' msg.")
                    break
                elif msg.data == "/n":
                    try:
                        await ws.send_str("/n")
                    except ConnectionResetError as e:
                        log.error(e, stack_info=True, exc_info=True)
                else:
                    data = json.loads(msg.data)
                    # log.debug("Websocket (%s) message: %s" % (id(ws), msg))

                    if game is None:
                        game = await load_game(request.app, data["gameId"])
                        if game is None:
                            continue

                    if data["type"] == "move":
                        await handle_move(app, user, data, game)
                    elif data["type"] == "berserk":
                        await handle_berserk(data, game)
                    elif data["type"] == "analysis_move":
                        handle_analysis_move(app, user, data, game)
                    elif data["type"] == "ready":
                        await handle_ready(ws, users, user, data, game)
                    elif data["type"] == "board":
                        await hande_board(ws, game)
                    elif data["type"] == "setup":
                        await handle_setup(ws, users, user, data, game)
                    elif data["type"] == "analysis":
                        await handle_analysis(app, ws, users, data, game)
                    elif data["type"] == "rematch":
                        await handle_rematch(app, ws, users, user, data, game)
                    elif data["type"] == "reject_rematch":
                        await handle_reject_rematch(user, game)
                    elif data["type"] == "draw":
                        await handle_draw(ws, users, user, data, game)
                    elif data["type"] == "reject_draw":
                        await handle_reject_draw(user, game)
                    elif data["type"] == "logout":
                        await handle_logout(ws)
                    elif data["type"] == "byoyomi":
                        await handle_byoyomi(data, game)
                    elif data["type"] == "takeback":
                        await handle_takeback(ws, game)
                    elif data["type"] in ("abort", "resign", "abandon", "flag"):
                        await handle_abort_resign_abandon_flag(ws, users, user, data, game)
                    elif data["type"] == "embed_user_connected":
                        await handle_embed_user_connected(ws)
                    elif data["type"] == "game_user_connected":
                        await handle_game_user_connected(app, ws, users, user, data, game)
                    elif data["type"] == "is_user_present":
                        await handle_is_user_present(ws, users, data)
                    elif data["type"] == "moretime":
                        await handle_moretime(users, user, data, game)
                    elif data["type"] == "bugroundchat":
                        await handle_bugroundchat(users, user, data, game)
                    elif data["type"] == "roundchat":
                        await handle_roundchat(app, ws, users, user, data, game)
                    elif data["type"] == "leave":
                        await handle_leave(user, data, game)
                    elif data["type"] == "updateTV":
                        await handle_updateTV(app, db, ws, users, data)
                    elif data["type"] == "count":
                        await handle_count(ws, user, data, game)
                    elif data["type"] == "delete":
                        await handle_delete(db, ws, data)
            elif msg.type == aiohttp.WSMsgType.CLOSED:
                log.debug(
                    "--- Round websocket %s msg.type == aiohttp.WSMsgType.CLOSED",
                    id(ws),
                )
                break

            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error("--- Round ws %s msg.type == aiohttp.WSMsgType.ERROR. msg = %r", id(ws), msg)
                break

            else:
                log.debug("--- Round ws other msg.type %s %s", msg.type, msg)
        log.info("--- Round websocket %s closed", id(ws))
    except OSError:
        # disconnected?
        log.exception("ERROR: OSError in round_socket_handler() owned by %s ", session_user)

    except Exception:
        log.exception("ERROR: Exception in round_socket_handler() owned by %s ", session_user)

    finally:
        log.debug("--- wsr.py fianlly: await ws.close() %s", session_user)
        await ws.close()

        if game is not None and user is not None and not user.bot:
            if game.id in user.game_sockets:
                log.debug("Socket %s has been closed. Removing it from user's game_sockets, but only if (%r) current game_socket is the same as it might have meanwhile been re-initialized. Current game_socket: %d", id(ws), (user.game_sockets[game.id] == ws), id(user.game_sockets[game.id]))
                if user.game_sockets[game.id] == ws:
                    del user.game_sockets[game.id]
                    user.update_online()

            if user in (game.wplayer, game.bplayer) and (not game.corr):
                user.abandon_game_task = asyncio.create_task(user.abandon_game(game))
            else:
                game.spectators.discard(user)
                await round_broadcast(game, game.spectator_list, full=True)

            # not connected to any other game socket after we closed this one. maybe we havae a change of online users count
            if len(user.game_sockets) == 0:
                await lobby_broadcast_online_users_count(app, users, user)

        if game is not None and user is not None:
            response = {"type": "user_disconnected", "username": user.username}
            await round_broadcast(game, response, full=True)

    return ws

async def handle_move(app, user, data, game):
    log.debug("Got USER move %s %s %s" % (user.username, data["gameId"], data["move"]))
    async with game.move_lock:
        try:
            await play_move(
                app,
                user,
                game,
                data["move"],
                data["clocks"],
                data["ply"]
            )
        except Exception:
            log.exception(
                "ERROR: Exception in play_move() in %s by %s ",
                data["gameId"],
                user.username,
            )

async def handle_berserk(data, game):
    game.berserk(data["color"])
    response = {"type": "berserk", "color": data["color"]}
    await round_broadcast(game, response, full=True)

async def handle_analysis_move(app, user, data, game):
    await analysis_move(
        app,
        user,
        game,
        data["move"],
        data["fen"],
        data["ply"],
    )


async def handle_ready(ws, users, user, data, game):
    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )
    opp_player = await users.get(opp_name)
    if opp_player is not None and opp_player.bot:
        # Janggi game start have to wait for human player setup!
        if game.variant != "janggi" or not (game.bsetup or game.wsetup):
            await opp_player.event_queue.put(game.game_start)

        response = {"type": "gameStart", "gameId": data["gameId"]}
        await ws.send_json(response)
    else:
        response = {"type": "gameStart", "gameId": data["gameId"]}
        await ws.send_json(response)

        response = {
            "type": "user_present",
            "username": user.username,
        } # todo:niki: this is never user?
        await round_broadcast(game, game.spectator_list, full=True)

async def hande_board(ws, game):
    if game.variant == "janggi":
        print("JANGGI", game.bsetup, game.wsetup, game.status)
        if (game.bsetup or game.wsetup) and game.status <= STARTED:
            if game.bsetup:
                await ws.send_json(
                    {
                        "type": "setup",
                        "color": "black",
                        "fen": game.board.initial_fen,
                    }
                )
            elif game.wsetup:
                await ws.send_json(
                    {
                        "type": "setup",
                        "color": "white",
                        "fen": game.board.initial_fen,
                    }
                )
        else:
            board_response = game.get_board(full=True)
            await ws.send_json(board_response)
    else:
        board_response = game.get_board(full=True)
        await ws.send_json(board_response)

    if game.corr and game.status <= STARTED and len(game.draw_offers) > 0:
        offerer = (
            game.wplayer
            if game.wplayer.username in game.draw_offers
            else game.bplayer
        )
        response = await draw(game, offerer)
        await ws.send_json(response)

async def handle_setup(ws, users, user, data, game):
    # Janggi game starts with a prelude phase to set up horses and elephants
    # First the second player (Red) choses his setup! Then the first player (Blue)

    game.board.initial_fen = data["fen"]
    game.initial_fen = game.board.initial_fen
    game.board.fen = game.board.initial_fen
    # print("--- Got FEN from %s %s" % (data["color"], data["fen"]))

    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )
    opp_player = users[opp_name]

    game.steps[0]["fen"] = data["fen"]

    if data["color"] == "black":
        game.bsetup = False
        response = {
            "type": "setup",
            "color": "white",
            "fen": data["fen"],
        }
        await ws.send_json(response) # todo:niki: use send_game_message here as well, even tho it is same ws (hopefully)

        if opp_player.bot:
            game.board.janggi_setup("w")
            game.steps[0]["fen"] = game.board.initial_fen
        else:
            await users[opp_name].send_game_message(game.id, response)
    else:
        game.wsetup = False
        game.status = STARTED

        response = game.get_board(full=True)
        # log.info("User %s asked board. Server sent: %s" % (user.username, board_response["fen"]))
        await ws.send_json(response)

        if not opp_player.bot:
            await opp_player.send_game_message(data["gameId"], response)

    await game.save_setup()

    if opp_player.bot:
        await opp_player.event_queue.put(game.game_start)

    # restart expiration time after setup phase
    game.stopwatch.restart(game.stopwatch.time_for_first_move)

async def handle_analysis(app, ws, users, data, game):
    # If there is any fishnet client, use it.
    if len(app[workers_key]) > 0:
        work_id = "".join(
            random.choice(string.ascii_letters + string.digits)
            for x in range(6)
        )
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
            "nnue": game.board.nnue,
            "nodes": 500000,  # optional limit
            #  "skipPositions": [1, 4, 5]  # 0 is the first position
        }
        app[fishnet_works_key][work_id] = work
        app[fishnet_queue_key].put_nowait((ANALYSIS, work_id))
    else:
        engine = users["Fairy-Stockfish"]

        if (engine is not None) and engine.online:
            engine.game_queues[data["gameId"]] = asyncio.Queue()
            await engine.event_queue.put(game.analysis_start(data["username"]))

    response = chat_response(
        "roundchat",
        "",
        "Analysis request sent...",
        room="spectator",
    )
    await ws.send_json(response)

async def handle_rematch(app, ws, users, user, data, game):
    seeks = app[seeks_key]

    rematch_id = None

    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )
    opp_player = users[opp_name]
    handicap = data["handicap"]
    fen = "" if game.variant == "janggi" else game.initial_fen

    if opp_player.bot:
        if opp_player.username == "Random-Mover":
            engine = users["Random-Mover"]
        else:
            engine = users["Fairy-Stockfish"]

        if engine is None or not engine.online:
            # TODO: message that engine is offline, but capture BOT will play instead
            engine = users["Random-Mover"]

        color = "w" if game.wplayer.username == opp_name else "b"
        if handicap:
            color = "w" if color == "b" else "b"
        seek = Seek(
            user,
            game.variant,
            fen=fen,
            color=color,
            base=game.base,
            inc=game.inc,
            byoyomi_period=game.byoyomi_period,
            day=game.base if game.corr else 0,
            level=game.level,
            rated=game.rated,
            player1=user,
            chess960=game.chess960,
        )
        seeks[seek.id] = seek

        response = await join_seek(app, engine, seek.id)
        await ws.send_json(response)

        await engine.event_queue.put(challenge(seek, response))
        gameId = response["gameId"]
        rematch_id = gameId
        engine.game_queues[gameId] = asyncio.Queue()
    else:
        if opp_name in game.rematch_offers:
            color = "w" if game.wplayer.username == opp_name else "b"
            if handicap:
                color = "w" if color == "b" else "b"
            seek = Seek(
                user,
                game.variant,
                fen=fen,
                color=color,
                base=game.base,
                inc=game.inc,
                byoyomi_period=game.byoyomi_period,
                day=game.base if game.corr else 0,
                level=game.level,
                rated=game.rated,
                player1=user,
                chess960=game.chess960,
            )
            seeks[seek.id] = seek

            response = await join_seek(app, opp_player, seek.id)
            rematch_id = response["gameId"]
            await ws.send_json(
                response)  # todo:niki: use send_game_message here as well, even tho it is same ws (hopefully)
            await users[opp_name].send_game_message(data["gameId"], response)
        else:
            game.rematch_offers.add(user.username)
            response = {
                "type": "rematch_offer",
                "username": user.username,
                "message": "Rematch offer sent",
                "room": "player",
                "user": "",
            }
            game.messages.append(response)
            await ws.send_json(response)
            await users[opp_name].send_game_message(data["gameId"], response)
    if rematch_id:
        await round_broadcast(
            game, {"type": "view_rematch", "gameId": rematch_id}
        )

async def handle_reject_rematch(user, game):
    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )

    if opp_name in game.rematch_offers:
        await round_broadcast(
            game,
            {
                "type": "rematch_rejected",
                "message": "Rematch offer rejected",
            },
            full=True,
        )

async def handle_draw(ws, users, user, data, game):
    color = WHITE if user.username == game.wplayer.username else BLACK
    opp_name = (
        game.wplayer.username if color == BLACK else game.bplayer.username
    )
    opp_player = users[opp_name]

    response = await draw(game, user, agreement=opp_name in game.draw_offers)
    await ws.send_json(response)
    if opp_player.bot:
        if game.status > STARTED and data["gameId"] in opp_player.game_queues:
            await opp_player.game_queues[data["gameId"]].put(game.game_end)
    else:
        try:
            await users[opp_name].send_game_message(data["gameId"], response)
        except KeyError:
            log.error("Opp disconnected", stack_info=True, exc_info=True)
            # opp disconnected
            pass

    if opp_name not in game.draw_offers:
        game.draw_offers.add(user.username)

    await round_broadcast(game, response)

async def handle_reject_draw(user, game):
    color = WHITE if user.username == game.wplayer.username else BLACK
    opp_user = game.wplayer if color == BLACK else game.bplayer

    response = await reject_draw(game, opp_user)
    if response is not None:
        await round_broadcast(game, response, full=True)

async def handle_logout(ws):
    await ws.close()

async def handle_byoyomi(data, game):
    game.byo_correction += game.inc * 1000
    game.byoyomi_periods[data["color"]] = data["period"]
    # print("BYOYOMI:", data)

async def handle_takeback(ws, game):
    game.takeback()
    board_response = game.get_board(full=True)
    board_response["takeback"] = True
    await ws.send_json(board_response)

async def handle_abort_resign_abandon_flag(ws, users, user, data, game):

    if data["type"] == "abort" and (game is not None) and game.board.ply > 2:
        return

    if game.status > STARTED:
        # game was already finished!
        # see  https://github.com/gbtami/pychess-variants/issues/675
        return

    async with game.move_lock:
        response = await game.game_ended(user, data["type"])

    await ws.send_json(response)

    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )
    opp_player = users[opp_name]
    if opp_player.bot:
        if data["gameId"] in opp_player.game_queues:
            await opp_player.game_queues[data["gameId"]].put(game.game_end)
    else:
        await users[opp_name].send_game_message(data["gameId"], response)

    await round_broadcast(game, response)

async def handle_embed_user_connected(ws):
    response = {"type": "embed_user_connected"}
    await ws.send_json(response)

async def handle_game_user_connected(app, ws, users, user, data, game: game.Game):
    # update websocket
    if data["gameId"] in user.game_sockets:
        log.debug(
            "Closing existing socket %s, before replacing it with the new one. Maybe we shuldnt close it tho if it is the same?",
            id(user.game_sockets[data["gameId"]]))
        await user.game_sockets[data[
            "gameId"]].close()  # todo:niki: what happens if this thrwos exception? it will fail to initialize below stuff
    log.debug("Setting user %r game_socket[%s] = %r", user, data["gameId"], id(ws))
    user.game_sockets[data["gameId"]] = ws
    user.update_online()

    # remove user seeks
    if len(user.lobby_sockets) == 0 or (
            game.status <= STARTED
            and user.username in (game.wplayer.username, game.bplayer.username)
    ):
        await game.wplayer.clear_seeks()
        await game.bplayer.clear_seeks()

    if not game.is_player(user):
        game.spectators.add(user)
        await round_broadcast(game, game.spectator_list, full=True)

    stopwatch_secs = game.stopwatch.secs if (not game.corr and game.variant != 'bughouse') else 0
    response = {
        "type": "game_user_connected",
        "username": user.username,
        "gameId": data["gameId"],
        "ply": game.ply,
        "firstmovetime": stopwatch_secs,
    }
    await ws.send_json(response)

    if user.abandon_game_task is not None:
        user.abandon_game_task.cancel()

    response = {"type": "fullchat", "lines": list(game.messages)}
    await ws.send_json(response)

    response = {"type": "user_present", "username": user.username}
    await round_broadcast(game, response, full=True)

    # if this is the first game socket for this user, maybe we have a change in what we considered online user count
    if len(user.game_sockets) == 1:
        await lobby_broadcast_online_users_count(app, users, user)
async def lobby_broadcast_online_users_count(app, users, user):
    # the fact this method is called means last game socket for this user was closed or first was opened
    # if also not connected to lobby socket this means we have a change of count of online users.
    # todo:niki:the combination of conditions is probably wrong when users moves from lobby to a new game
    #           even if correct, the way i have split these conditions one here and one outside is super ugly
    sockets = app[lobbysockets_key];
    if user.username not in sockets:
        response = {"type": "u_cnt", "cnt": online_count(users)}
        await lobby_broadcast(sockets, response)

async def handle_is_user_present(ws, users, data):
    player_name = data["username"]
    player = await users.get(player_name)
    await asyncio.sleep(1)
    if player is not None and data["gameId"] in (
            player.game_queues if player.bot else player.game_sockets
    ):
        response = {"type": "user_present", "username": player_name}
    else:
        response = {
            "type": "user_disconnected",
            "username": player_name,
        }
    await ws.send_json(response)

async def handle_moretime(users, user, data, game):
    opp_color = WHITE if user.username == game.bplayer.username else BLACK
    if (not game.corr) and opp_color == game.stopwatch.color:
        opp_time = game.stopwatch.stop()
        game.stopwatch.restart(opp_time + MORE_TIME)

    opp_name = (
        game.wplayer.username
        if user.username == game.bplayer.username
        else game.bplayer.username
    )
    opp_player = users[opp_name]

    if not opp_player.bot:
        response = {"type": "moretime", "username": opp_name}
        await users[opp_name].send_game_message(data["gameId"], response)
        await round_broadcast(game, response)

async def handle_bugroundchat(users, user, data, game):
    gameId = data["gameId"]
    message = data["message"]

    response = chat_response(
        "bugroundchat",
        user.username,
        message,
        room=data["room"],
    )
    game.handle_chat_message(user, message)
    if game.ply < 4 or game.status > STARTED:
        # Let all 4 players communicate in the beginning of the game and when it is over
        recipients = [game.wplayerA.username, game.bplayerA.username, game.wplayerB.username, game.bplayerB.username]
    elif user.username in [game.wplayerA.username, game.bplayerB.username]:
        recipients = [game.wplayerA.username, game.bplayerB.username]
    else:
        recipients = [game.bplayerA.username, game.wplayerB.username]
    recipients = list(dict.fromkeys(
        recipients))  # remove duplicates - can have if simuling (not that it makes sense to have this chat in simul mode but anyway)
    for name in recipients:
        player = users[name]
        await player.send_game_message(gameId, response)

    await round_broadcast(game, response)

async def handle_roundchat(app, ws, users, user, data, game):
    if user.username.startswith(ANON_PREFIX):
        return

    gameId = data["gameId"]
    message = data["message"]
    # Users running a fishnet worker can ask server side analysis with chat message: !analysis
    if (
            data["message"] == "!analysis"
            and user.username in app[fishnet_versions_key]
    ):
        for step in game.steps:
            if "analysis" in step:
                del step["analysis"]
        await ws.send_json({"type": "request_analysis"})
        return

    response = chat_response(
        "roundchat",
        user.username,
        message,
        room=data["room"],
    )
    if game.variant != "bughouse":  # todo:niki: add new method in both places
        game.messages.append(response)
    else:
        game.handle_chat_message(user, message)

    for name in (game.wplayer.username, game.bplayer.username):
        player = users[name]
        if player.bot:
            if gameId in player.game_queues:
                await player.game_queues[gameId].put(
                    '{"type": "chatLine", "username": "%s", "room": "spectator", "text": "%s"}\n'
                    % (user.username, message)
                )
        else:
            await player.send_game_message(gameId, response)

    await round_broadcast(game, response)

async def  handle_leave(user, data, game):
    gameId = data["gameId"]

    response_chat = chat_response(
        "roundchat",
        "",
        "%s left the game" % user.username,
        room="player",
    )
    game.messages.append(response_chat)
    response = {
        "type": "user_disconnected",
        "username": user.username,
    }

    other_players = filter(lambda p: p.username != user.username, game.all_players)
    for p in other_players:
        if not p.bot:
            await p.send_game_message(gameId, response_chat)
            await p.send_game_message(gameId, response)

    await round_broadcast(game, response)

async def handle_updateTV(app, db, ws, users, data):
    if "profileId" in data and data["profileId"] != "":
        gameId = await tv_game_user(db, users, data["profileId"])
    else:
        gameId = await tv_game(db, app)

    if gameId != data["gameId"] and gameId is not None:
        response = {"type": "updateTV", "gameId": gameId}
        await ws.send_json(response)

async def handle_count(ws, user, data, game):
    cur_player = game.bplayer if game.board.color == BLACK else game.wplayer

    if user.username == cur_player.username:
        if data["mode"] == "start":
            game.start_manual_count()
            response = {
                "type": "count",
                "message": "Board's honor counting started",
                "room": "player",
                "user": "",
            }
        elif data["mode"] == "stop":
            game.stop_manual_count()
            response = {
                "type": "count",
                "message": "Board's honor counting stopped",
                "room": "player",
                "user": "",
            }
        await round_broadcast(game, response, full=True)
    else:
        response = {
            "type": "count",
            "message": "You can only start/stop board's honor counting on your own turn!",
            "room": "player",
            "user": "",
        }
        await ws.send_json(response)

async def handle_delete(db, ws, data):
    await db.game.delete_one({"_id": data["gameId"]})
    response = {"type": "deleted"}
    await ws.send_json(response)
