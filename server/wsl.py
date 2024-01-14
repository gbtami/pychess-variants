from __future__ import annotations
import asyncio
import logging

import aiohttp_session
from aiohttp import web

from admin import silence
from broadcast import broadcast_streams
from chat import chat_response
from const import ANON_PREFIX, STARTED
from login import logout
from misc import server_state
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from seek import challenge, create_seek, get_seeks, Seek
from settings import ADMINS, TOURNAMENT_DIRECTORS
from tournament_spotlights import tournament_spotlights
from bug.utils_bug import join_seek_bughouse
from utils import join_seek, load_game, remove_seek
from websocket_utils import get_user, process_ws

log = logging.getLogger(__name__)


async def lobby_socket_handler(request):
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)

    ws = await process_ws(session, request, user, init_ws, process_message)
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(app_state, ws, user)
    return ws


async def init_ws(app_state: PychessGlobalAppState, ws, user):
    await send_game_in_progress_if_any(app_state, user, ws)
    await send_lobby_user_connected(app_state, ws, user)
    await send_get_seeks(ws, app_state.seeks)


async def finally_logic(app_state: PychessGlobalAppState, ws, user):
    if user is not None:
        if ws in user.lobby_sockets:
            user.lobby_sockets.remove(ws)
            user.update_online()

        # not connected to lobby socket and not connected to game socket
        if user.is_user_active_in_game() and len(user.lobby_sockets) == 0:
            await app_state.lobby.lobby_broadcast_u_cnt()

        await user.update_seeks(pending=True)


async def process_message(app_state: PychessGlobalAppState, user, ws, data):
    if data["type"] == "create_ai_challenge":
        await handle_create_ai_challenge(app_state, ws, user, data)
    elif data["type"] == "create_seek":
        await handle_create_seek(app_state, ws, user, data)
    elif data["type"] == "create_invite":
        await handle_create_invite(app_state, ws, user, data)
    elif data["type"] == "create_host":
        await handle_create_host(app_state, ws, user, data)
    elif data["type"] == "delete_seek":
        await handle_delete_seek(app_state, user, data)
    elif data["type"] == "accept_seek":
        await handle_accept_seek(app_state, ws, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app_state, user, data)


async def send_get_seeks(ws, seeks):
    response = get_seeks(seeks)
    await ws.send_json(response)


async def handle_create_ai_challenge(app_state: PychessGlobalAppState, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    variant = data["variant"]
    engine = app_state.users["Fairy-Stockfish"]

    if data["rm"] or (engine is None) or (not engine.online):
        # TODO: message that engine is offline, but Random-Mover BOT will play instead
        engine = app_state.users["Random-Mover"]

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
    )
    # print("SEEK", user, variant, data["fen"], data["color"], data["minutes"], data["increment"], data["level"], False, data["chess960"])
    app_state.seeks[seek.id] = seek

    response = await join_seek(app_state, engine, seek.id)
    await ws.send_json(response)

    if response["type"] != "error":
        gameId = response["gameId"]
        engine.game_queues[gameId] = asyncio.Queue()
        await engine.event_queue.put(challenge(seek, response))


async def handle_create_seek(app_state, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    log.debug("create_seek %s", data)
    seek = await create_seek(app_state.db, app_state.invites, app_state.seeks, user, data, ws)
    await app_state.lobby.lobby_broadcast_seeks()
    if (seek is not None) and seek.target == "":
        await app_state.discord.send_to_discord("create_seek", seek.discord_msg)


async def handle_create_invite(app_state: PychessGlobalAppState, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    print("create_invite", data)
    seek = await create_seek(app_state.db, app_state.invites, app_state.seeks, user, data, ws)

    response = {"type": "invite_created", "gameId": seek.game_id}
    await ws.send_json(response)


async def handle_create_host(app_state: PychessGlobalAppState, ws, user, data):
    no = user.username not in TOURNAMENT_DIRECTORS
    if no:
        return

    print("create_host", data)
    seek = await create_seek(app_state.db, app_state.invites, app_state.seeks, user, data, ws, True)

    response = {"type": "host_created", "gameId": seek.game_id}
    await ws.send_json(response)


async def handle_delete_seek(app_state: PychessGlobalAppState, user, data):
    try:
        seek = app_state.seeks[data["seekID"]]
        if seek.game_id is not None:
            # delete game invite
            del app_state.invites[seek.game_id]
        del app_state.seeks[data["seekID"]]
        del user.seeks[data["seekID"]]
    except KeyError:
        # Seek was already deleted
        log.error("Seek was already deleted", stack_info=True, exc_info=True)
    await app_state.lobby.lobby_broadcast_seeks()


async def handle_accept_seek(app_state: PychessGlobalAppState, ws, user, data):
    if data["seekID"] not in app_state.seeks:
        return

    seek = app_state.seeks[data["seekID"]]

    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    # print("accept_seek", seek.as_json)
    if seek.variant == 'bughouse':
        response = await join_seek_bughouse(app_state, user, data["seekID"], None, data["joinAs"])
        await ws.send_json(response)

        if seek.ws is None:  # todo:niki: i dont really understand this if? I guess it is when whoever created the seek disappeared. I should test what happens on refresh maybe, in any case makes sense to leave it as is
            remove_seek(app_state.seeks, seek)
            await app_state.lobby.lobby_broadcast_seeks()
        else:
            await seek.ws.send_json(response)
            bugUsers = set(filter(lambda item: item is not None, [seek.player2, seek.bugPlayer1, seek.bugPlayer2]))
            for u in bugUsers:
                s = next(iter(
                    u.lobby_sockets))  # todo:niki:could be more than one if multiple browsers - could potentially record the one they joined from i guess
                await s.send_json(response)
            await app_state.lobby.lobby_broadcast_seeks()
    else:
        response = await join_seek(app_state, user, data["seekID"])
        await ws.send_json(response)

        if seek.creator.bot:
            gameId = response["gameId"]
            seek.creator.game_queues[gameId] = asyncio.Queue()
            await seek.creator.event_queue.put(challenge(seek, response))
        else:
            if seek.ws is None:
                remove_seek(app_state.seeks, seek)
                await app_state.lobby.lobby_broadcast_seeks()
            else:
                await seek.ws.send_json(response)

        # Inform others, new_game() deleted accepted seek already.
        await app_state.lobby.lobby_broadcast_seeks()


async def send_lobby_user_connected(app_state, ws, user):
    # update websocket
    user.lobby_sockets.add(ws)
    user.update_online()
    app_state.lobby.lobbysockets[user.username] = user.lobby_sockets

    await send_game_in_progress_if_any(
        app_state, user, ws
    )  # if there is an ongoing game, always notify use on connect

    response = {
        "type": "lobby_user_connected",
        "username": user.username,
    }
    await ws.send_json(response)

    response = {"type": "fullchat", "lines": list(app_state.lobby.lobbychat)}
    await ws.send_json(response)

    # send game count
    response = {"type": "g_cnt", "cnt": app_state.g_cnt[0]}
    await ws.send_json(response)

    # send user count
    if user.is_user_active_in_game() == 0:
        await app_state.lobby.lobby_broadcast_u_cnt()
    else:
        response = {
            "type": "u_cnt",
            "cnt": app_state.online_count(),
        }  # todo: duplicated message definition also in lobby_broadcast_u_cnt
        await ws.send_json(response)

    spotlights = tournament_spotlights(app_state)
    if len(spotlights) > 0:
        await ws.send_json({"type": "spotlights", "items": spotlights})

    streams = app_state.twitch.live_streams + app_state.youtube.live_streams
    if len(streams) > 0:
        await ws.send_json({"type": "streams", "items": streams})

    if (
        app_state.tv is not None
        and app_state.tv in app_state.games
        and hasattr(app_state.games[app_state.tv], "tv_game_json")
    ):
        await ws.send_json(app_state.games[app_state.tv].tv_game_json)

    await user.update_seeks(pending=False)


async def handle_lobbychat(app_state, user, data):
    if user.username.startswith(ANON_PREFIX):
        return

    message = data["message"]
    response = None
    admin_command = False

    if user.username in ADMINS:
        if message.startswith("/silence"):
            admin_command = True
            response = silence(message, app_state.lobby.lobbychat, app_state.users)
            # silence message was already added to lobbychat in silence()

        elif message.startswith("/stream"):
            admin_command = True
            parts = message.split()
            if len(parts) >= 3:
                if parts[1] == "add":
                    if len(parts) >= 5:
                        app_state.youtube.add(parts[2], parts[3], parts[4])
                    elif len(parts) >= 4:
                        app_state.youtube.add(parts[2], parts[3])
                    else:
                        app_state.youtube.add(parts[2])
                elif parts[1] == "remove":
                    app_state.youtube.remove(parts[2])
                await broadcast_streams(app_state)

        elif message.startswith("/delete"):
            admin_command = True
            parts = message.split()
            if len(parts) == 2 and len(parts[1]) == 5:
                await app_state.db.puzzle.delete_one({"_id": parts[1]})

        elif message.startswith("/ban"):
            admin_command = True
            parts = message.split()
            if len(parts) == 2 and parts[1] in app_state.users and parts[1] not in ADMINS:
                banned_user = await app_state.users.get(parts[1])
                banned_user.enabled = False
                await app_state.db.user.find_one_and_update(
                    {"_id": parts[1]}, {"$set": {"enabled": False}}
                )
                await logout(None, banned_user)

        elif message == "/state":
            admin_command = True
            server_state(app_state)

        else:
            response = chat_response("lobbychat", user.username, data["message"])
            app_state.lobby.lobbychat.append(response)

    elif user.anon and user.username != "Discord-Relay":
        pass

    else:
        if user.silence == 0:
            response = chat_response("lobbychat", user.username, data["message"])
            app_state.lobby.lobbychat.append(response)

    if response is not None:
        await app_state.lobby.lobby_broadcast(response)

    if user.silence == 0 and not admin_command:
        await app_state.discord.send_to_discord("lobbychat", data["message"], user.username)


async def send_game_in_progress_if_any(app_state: PychessGlobalAppState, user, ws):
    # Prevent None user to handle seeks
    if user is None:
        return True
    # Prevent users to start new games if they have an unfinished one
    if user.game_in_progress is not None:
        game = await load_game(app_state, user.game_in_progress)
        if (game is None) or game.status > STARTED:
            user.game_in_progress = None
            return False
        response = {"type": "game_in_progress", "gameId": user.game_in_progress}
        await ws.send_json(response)
        return True
    else:
        return False
