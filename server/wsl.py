from __future__ import annotations
import asyncio
from datetime import datetime, timezone

import aiohttp_session
from aiohttp import web

from admin import (
    ban,
    crosstable,
    delete_puzzle,
    disable_new_anons,
    fishnet,
    highscore,
    silence,
    stream,
)
from auto_pair import (
    auto_pair,
    add_to_auto_pairings,
    find_matching_user_for_seek,
)
from chat import chat_response
from const import ANON_PREFIX, STARTED
from newid import new_id
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from seek import challenge, create_seek, get_seeks, Seek
from settings import ADMINS, TOURNAMENT_DIRECTORS
from tournament.tournament_spotlights import tournament_spotlights
from bug.utils_bug import handle_accept_seek_bughouse, handle_leave_seek_bughouse
from utils import join_seek, load_game, remove_seek
from websocket_utils import get_user, process_ws, ws_send_json
from logger import log
from variants import get_server_variant


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
    user.last_seen = datetime.now(timezone.utc)
    await send_game_in_progress_if_any(app_state, user, ws)
    await send_lobby_user_connected(app_state, ws, user)
    await send_get_seeks(app_state, ws, user)


async def finally_logic(app_state: PychessGlobalAppState, ws, user):
    if user is not None:
        if ws in user.lobby_sockets:
            user.lobby_sockets.remove(ws)
            user.update_online()
            if len(app_state.lobby.lobbysockets[user.username]) == 0:
                del app_state.lobby.lobbysockets[user.username]

        # not connected to lobby socket and not connected to game socket
        if user.is_user_active_in_game() and len(user.lobby_sockets) == 0:
            await app_state.lobby.lobby_broadcast_u_cnt()

        if (user.game_in_progress is not None) or len(user.lobby_sockets) == 0:
            user.update_auto_pairing(ready=False)
            await user.update_seeks(pending=True)

            if (not user.anon) and len(user.lobby_sockets) == 0:
                for seek in list(app_state.seeks.values()):
                    server_variant = get_server_variant(seek.variant, seek.chess960)
                    if server_variant.two_boards:
                        await handle_leave_seek_bughouse(app_state, user, seek)


async def process_message(app_state: PychessGlobalAppState, user, ws, data):
    print(user.username, data)
    if data["type"] == "create_ai_challenge":
        await handle_create_ai_challenge(app_state, ws, user, data)
    elif data["type"] == "create_seek":
        await handle_create_seek(app_state, ws, user, data)
    elif data["type"] == "create_invite":
        await handle_create_invite(app_state, ws, user, data)
    elif data["type"] == "create_bot_challenge":
        await handle_create_bot_challenge(app_state, ws, user, data)
    elif data["type"] == "create_host":
        await handle_create_host(app_state, ws, user, data)
    elif data["type"] == "delete_seek":
        await handle_delete_seek(app_state, user, data)
    elif data["type"] == "leave_seek":
        await handle_leave_seek(app_state, ws, user, data)
    elif data["type"] == "accept_seek":
        await handle_accept_seek(app_state, ws, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app_state, ws, user, data)
    elif data["type"] == "create_auto_pairing":
        await handle_create_auto_pairing(app_state, ws, user, data)
    elif data["type"] == "cancel_auto_pairing":
        await handle_cancel_auto_pairing(app_state, ws, user, data)


async def send_get_seeks(app_state, ws, user):
    # We will need all the seek users blocked info
    seeks = app_state.seeks.values()
    for seek in seeks:
        await app_state.users.get(seek.creator.username)

    response = {"type": "get_seeks", "seeks": get_seeks(user, seeks)}
    await ws_send_json(ws, response)


async def handle_create_ai_challenge(app_state: PychessGlobalAppState, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    variant = data["variant"]
    profileid = data["profileid"]
    engine = app_state.users[profileid]

    if variant in ("alice", "fogofwar") or data["rm"] or (engine is None) or (not engine.online):
        # TODO: message that engine is offline, but Random-Mover BOT will play instead
        engine = app_state.users["Random-Mover"]

    seek_id = await new_id(None if app_state.db is None else app_state.db.seek)
    seek = Seek(
        seek_id,
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
    log.debug("adding seek: %s" % seek)

    response = await join_seek(app_state, engine, seek)
    await ws_send_json(ws, response)

    if response["type"] != "error":
        gameId = response["gameId"]
        engine.game_queues[gameId] = asyncio.Queue()
        await engine.event_queue.put(challenge(seek))
        if engine.username not in ("Random-Mover", "Fairy-Stockfish"):
            game = app_state.games[gameId]
            await engine.event_queue.put(game.game_start)


async def handle_create_seek(app_state, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    log.debug("Creating seek from request: %s", data)
    seek = await create_seek(app_state.db, app_state.invites, app_state.seeks, user, data)
    log.debug("Created seek: %s", seek)

    matching_user = None
    # auto pairing games are never corr and always rated, so anon seek will never match!
    if seek.day == 0 and not user.anon:
        variant_tc = (seek.variant, seek.chess960, seek.base, seek.inc, seek.byoyomi_period)
        if variant_tc in app_state.auto_pairings:
            matching_user = find_matching_user_for_seek(app_state, seek, variant_tc)

    auto_paired = False
    if matching_user is not None:
        # Try to create a new game
        auto_paired = await auto_pair(app_state, matching_user, variant_tc, user, seek)

    if not auto_paired:
        await app_state.lobby.lobby_broadcast_seeks()
        if (seek is not None) and seek.target == "":
            await app_state.discord.send_to_discord("create_seek", seek.discord_msg)


async def handle_create_invite(app_state: PychessGlobalAppState, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    log.debug("Creating seek invite from request: %s", data)
    seek = await create_seek(app_state.db, app_state.invites, app_state.seeks, user, data)
    log.debug("Created seek invite: %s", seek)

    response = {"type": "invite_created", "gameId": seek.game_id}
    await ws_send_json(ws, response)


async def handle_create_bot_challenge(app_state: PychessGlobalAppState, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    profileid = data["profileid"]
    engine = await app_state.users.get(profileid)

    if (engine is None) or (not engine.online):
        return
    print("--- wsl.py handle_create_bot_challenge()  ---")

    log.debug("Creating BOT challenge from request: %s", data)
    seek = await create_seek(
        app_state.db, app_state.invites, app_state.seeks, user, data, engine=engine
    )
    log.debug("Created BOT challenge: %s", seek)

    engine.game_queues[seek.game_id] = asyncio.Queue()
    bot_challenge = challenge(seek)
    # lichess-bot uses "standard" as variant name, grrrr
    if seek.variant == "chess":
        bot_challenge = bot_challenge.replace("chess", "standard")
    await engine.event_queue.put(bot_challenge)

    response = {"type": "bot_challenge_created", "gameId": seek.game_id}
    await ws_send_json(ws, response)


async def handle_create_host(app_state: PychessGlobalAppState, ws, user, data):
    no = user.username not in TOURNAMENT_DIRECTORS
    if no:
        return

    seek = await create_seek(
        app_state.db, app_state.invites, app_state.seeks, user, data, empty=True
    )

    response = {"type": "host_created", "gameId": seek.game_id}
    await ws_send_json(ws, response)


async def handle_delete_seek(app_state: PychessGlobalAppState, user, data):
    try:
        seek = app_state.seeks[data["seekID"]]
        if seek.game_id is not None:
            # delete game invite
            del app_state.invites[seek.game_id]

        log.debug("Seeks now contains: [%s]" % " ".join(app_state.seeks))
        log.debug("Deleting seek: %s" % seek)
        del app_state.seeks[data["seekID"]]
        del user.seeks[data["seekID"]]
        log.debug("Deleted seek. Seeks now contains: [%s]" % " ".join(app_state.seeks))

    except KeyError:
        log.error("handle_delete_seek() KeyError. Seek %s was already deleted", data["seekID"])
    await app_state.lobby.lobby_broadcast_seeks()


async def handle_leave_seek(app_state: PychessGlobalAppState, ws, user, data):
    if data["seekID"] not in app_state.seeks:
        return

    seek = app_state.seeks[data["seekID"]]

    server_variant = get_server_variant(seek.variant, seek.chess960)
    if server_variant.two_boards:
        await handle_leave_seek_bughouse(app_state, user, seek)


async def handle_accept_seek(app_state: PychessGlobalAppState, ws, user, data):
    if data["seekID"] not in app_state.seeks:
        return

    seek = app_state.seeks[data["seekID"]]

    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    # print("accept_seek", seek.seek_json)
    server_variant = get_server_variant(seek.variant, seek.chess960)
    if server_variant.two_boards:
        await handle_accept_seek_bughouse(app_state, user, data, seek)
    else:
        response = await join_seek(app_state, user, seek)
        await ws_send_json(ws, response)

        if seek.creator.bot:
            gameId = response["gameId"]
            seek.creator.game_queues[gameId] = asyncio.Queue()
            await seek.creator.event_queue.put(challenge(seek))
        else:
            ws_set = list(seek.creator.lobby_sockets)
            if len(ws_set) == 0:
                remove_seek(app_state.seeks, seek)
                await app_state.lobby.lobby_broadcast_seeks()
            else:
                for creator_ws in ws_set:
                    await ws_send_json(creator_ws, response)

        # Inform others, new_game() deleted accepted seek already.
        await app_state.lobby.lobby_broadcast_seeks()

    if (seek is not None) and seek.target == "":
        msg = "%s accepted by %s" % (seek.discord_msg, user.username)
        await app_state.discord.send_to_discord("accept_seek", msg)


async def send_lobby_user_connected(app_state, ws, user):
    # update websocket
    user.lobby_sockets.add(ws)
    user.update_online()
    app_state.lobby.lobbysockets[user.username] = user.lobby_sockets

    response = {
        "type": "lobby_user_connected",
        "username": user.username,
    }
    await ws_send_json(ws, response)

    response = {"type": "fullchat", "lines": list(app_state.lobby.lobbychat)}
    await ws_send_json(ws, response)

    # send game count
    response = {"type": "g_cnt", "cnt": app_state.g_cnt[0]}
    await ws_send_json(ws, response)

    # send user count
    if user.is_user_active_in_game() == 0:
        await app_state.lobby.lobby_broadcast_u_cnt()
    else:
        response = {
            "type": "u_cnt",
            "cnt": app_state.online_count(),
        }  # todo: duplicated message definition also in lobby_broadcast_u_cnt
        await ws_send_json(ws, response)

    # send auto pairing count
    response = {"type": "ap_cnt", "cnt": app_state.auto_pairing_count()}
    await ws_send_json(ws, response)

    spotlights = tournament_spotlights(app_state)
    if len(spotlights) > 0:
        await ws_send_json(ws, {"type": "spotlights", "items": spotlights})

    streams = app_state.twitch.live_streams + app_state.youtube.live_streams
    if len(streams) > 0:
        await ws_send_json(ws, {"type": "streams", "items": streams})

    if (
        app_state.tv is not None
        and app_state.tv in app_state.games
        and hasattr(app_state.games[app_state.tv], "tv_game_json")
    ):
        await ws_send_json(ws, app_state.games[app_state.tv].tv_game_json)

    user.update_auto_pairing(ready=True)
    await user.update_seeks(pending=False)

    auto_pairing = "auto_pairing_on" if user in app_state.auto_pairing_users else "auto_pairing_off"
    await ws_send_json(ws, {"type": auto_pairing})


async def handle_lobbychat(app_state: PychessGlobalAppState, ws, user, data):
    if user.username.startswith(ANON_PREFIX):
        return

    message = data["message"]
    response = None
    admin_command = False

    if user.username in ADMINS:
        admin_command = True
        if message.startswith("/silence"):
            response = silence(app_state, message)
            # silence message was already added to lobbychat in silence()

        elif message.startswith("/disable_new_anons"):
            disable_new_anons(app_state, message)

        elif message.startswith("/stream"):
            await stream(app_state, message)

        elif message.startswith("/delete"):
            await delete_puzzle(app_state, message)

        elif message.startswith("/ban"):
            await ban(app_state, message)

        elif message.startswith("/highscore"):
            await highscore(app_state, message)

        elif message.startswith("/crosstable"):
            await crosstable(app_state, message)

        elif message.startswith("/fishnet"):
            # Don't give it to the response variable to prevent broadcasting it
            answare = await fishnet(app_state, message)
            await ws_send_json(ws, answare)

        else:
            admin_command = False
            response = chat_response("lobbychat", user.username, data["message"])
            await app_state.lobby.lobby_chat_save(response)

    elif user.anon and user.username != "Discord-Relay":
        pass

    else:
        if user.silence == 0:
            response = chat_response("lobbychat", user.username, data["message"])
            await app_state.lobby.lobby_chat_save(response)

    if response is not None:
        await app_state.lobby.lobby_broadcast(response)

    if user.silence == 0 and not admin_command:
        await app_state.discord.send_to_discord("lobbychat", data["message"], user.username)


async def handle_cancel_auto_pairing(app_state, ws, user, data):
    user.remove_from_auto_pairings()
    for user_ws in user.lobby_sockets:
        await ws_send_json(user_ws, {"type": "auto_pairing_off"})

    await app_state.lobby.lobby_broadcast_ap_cnt()


async def handle_create_auto_pairing(app_state, ws, user, data):
    no = await send_game_in_progress_if_any(app_state, user, ws)
    if no:
        return

    auto_variant_tc, matching_user, matching_seek = add_to_auto_pairings(app_state, user, data)

    auto_paired = False
    if (matching_user is not None) or (matching_seek is not None):
        # Try to create a new game
        auto_paired = await auto_pair(
            app_state, user, auto_variant_tc, matching_user, matching_seek
        )

    if not auto_paired:
        for user_ws in user.lobby_sockets:
            await ws_send_json(user_ws, {"type": "auto_pairing_on"})

    await app_state.lobby.lobby_broadcast_ap_cnt()

    # print("AUTO_PAIRING USERS", [item for item in app_state.auto_pairing_users.items()])
    # for key, value in app_state.auto_pairings.items():
    #     print(key, [user.username for user in app_state.auto_pairings[key]])


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
        await ws_send_json(ws, response)
        return True
    else:
        return False
