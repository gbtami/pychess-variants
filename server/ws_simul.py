from __future__ import annotations
from datetime import datetime, timezone

import aiohttp_session
from aiohttp import web

from admin import silence
from chat import chat_response
from const import ANON_PREFIX
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from settings import TOURNAMENT_DIRECTORS
from simul.simul import Simul
from websocket_utils import process_ws, get_user, ws_send_json

# from logger import log


async def simul_socket_handler(request):
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)
    ws = await process_ws(session, request, user, None, process_message)
    if ws is None:
        return web.HTTPFound("/")
    # await finally_logic(app_state, ws, user) # TODO
    return ws


async def process_message(app_state: PychessGlobalAppState, user, ws, data):
    if data["type"] == "simul_user_connected":
        await handle_simul_user_connected(app_state, ws, user, data)
    elif data["type"] == "start_simul":
        await handle_start_simul(app_state, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app_state, user, data)


async def handle_simul_user_connected(app_state: PychessGlobalAppState, ws, user, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    # update websocket
    # TODO: add simul_sockets to user object
    # if simulId not in user.simul_sockets:
    #     user.simul_sockets[simulId] = set()
    # user.simul_sockets[simulId].add(ws)

    user.update_online()

    # app_state.simulsockets[simulId][user.username] = user.simul_sockets[simulId]

    now = datetime.now(timezone.utc)
    response = {
        "type": "simul_user_connected",
        "username": user.username,
        "ustatus": simul.user_status(user),
        "urating": simul.user_rating(user),
        "tstatus": simul.status,
        "tsystem": simul.system,
        "tminutes": simul.minutes,
        "startsAt": simul.starts_at.isoformat(),
        "startFen": simul.fen,
        "description": simul.description,
        "createdBy": simul.created_by,
    }
    await ws_send_json(ws, response)

    # ...

async def handle_start_simul(app_state: PychessGlobalAppState, user, data):
    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    await simul.start_simul()


async def handle_lobbychat(app_state: PychessGlobalAppState, user, data):
    if user.username.startswith(ANON_PREFIX):
        return

    simulId = data["simulId"]
    simul = app_state.simuls.get(simulId)
    message = data["message"]
    response = None

    if user.username in TOURNAMENT_DIRECTORS:
        if message.startswith("/silence"):
            response = silence(message, simul.tourneychat, app_state.users)
        else:
            response = chat_response("lobbychat", user.username, data["message"])
            await simul.tourney_chat_save(response)
    elif user.anon:
        pass
    else:
        if user.silence == 0:
            response = chat_response("lobbychat", user.username, data["message"])
            await simul.tourney_chat_save(response)

    if response is not None:
        await simul.broadcast(response)
