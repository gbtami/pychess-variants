from __future__ import annotations
import aiohttp_session
from aiohttp import web

from pychess_global_app_state_utils import get_app_state
from websocket_utils import process_ws, get_user, ws_send_json
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User


async def simul_socket_handler(request):
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)
    ws = await process_ws(session, request, user, None, process_message)
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(app_state, ws, user)
    return ws


async def finally_logic(app_state: PychessGlobalAppState, ws, user: User):
    if user is not None:
        for simul_id in list(user.simul_sockets):
            if ws in user.simul_sockets[simul_id]:
                user.simul_sockets[simul_id].remove(ws)
                if len(user.simul_sockets[simul_id]) == 0:
                    del user.simul_sockets[simul_id]
                    user.update_online()
                    simul = app_state.simuls.get(simul_id)
                    if simul:
                        simul.remove_spectator(user)
                break


async def process_message(app_state: PychessGlobalAppState, user: User, ws, data):
    if data["type"] == "simul_user_connected":
        await handle_simul_user_connected(app_state, ws, user, data)
    elif data["type"] == "start_simul":
        await handle_start_simul(app_state, user, data)
    elif data["type"] == "join":
        await handle_join(app_state, user, data)
    elif data["type"] == "approve_player":
        await handle_approve_player(app_state, user, data)
    elif data["type"] == "deny_player":
        await handle_deny_player(app_state, user, data)


async def handle_simul_user_connected(app_state: PychessGlobalAppState, ws, user: User, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    if simulId not in user.simul_sockets:
        user.simul_sockets[simulId] = set()
    user.simul_sockets[simulId].add(ws)
    user.update_online()

    simul.add_spectator(user)

    response = {
        "type": "simul_user_connected",
        "players": [p.as_json(user.username) for p in simul.players.values()],
        "pendingPlayers": [p.as_json(user.username) for p in simul.pending_players.values()],
        "createdBy": simul.created_by,
        "username": user.username,
    }
    await ws_send_json(ws, response)


async def handle_start_simul(app_state: PychessGlobalAppState, user: User, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    await simul.start()


async def handle_join(app_state: PychessGlobalAppState, user: User, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    simul.join(user)
    await simul.broadcast({"type": "player_joined", "player": user.as_json(user.username)})


async def handle_approve_player(app_state: PychessGlobalAppState, user: User, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    username = data.get("username")
    simul.approve(username)
    await simul.broadcast({"type": "player_approved", "username": username})


async def handle_deny_player(app_state: PychessGlobalAppState, user: User, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    username = data.get("username")
    simul.deny(username)
    await simul.broadcast({"type": "player_denied", "username": username})
