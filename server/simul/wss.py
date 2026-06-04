from __future__ import annotations
from typing import TYPE_CHECKING
import aiohttp_session
from aiohttp import web

from chat import chat_response
from link_filter import sanitize_user_message
from pychess_global_app_state_utils import get_app_state
from simul.simuls import load_simul, upsert_simul_to_db
from websocket_utils import process_ws, get_user, ws_send_json

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User
    from ws_types import (
        SimulApprovePlayerRequest,
        SimulDenyPlayerRequest,
        SimulInboundMessage,
        SimulJoinRequest,
        SimulLobbyChatMessage,
        SimulStartRequest,
        SimulUserConnectedRequest,
    )


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
        for simul_id in tuple(user.simul_sockets):
            if ws in user.simul_sockets[simul_id]:
                user.simul_sockets[simul_id].remove(ws)
                if len(user.simul_sockets[simul_id]) == 0:
                    del user.simul_sockets[simul_id]
                    user.update_online()
                    simul = app_state.simuls.get(simul_id)
                    if simul:
                        simul.remove_spectator(user)
                        removed_group = simul.remove_disconnected_player(user)
                        if removed_group is not None:
                            await upsert_simul_to_db(simul, app_state)
                            # Do not block websocket teardown on fan-out send:
                            # this path can stall if one spectator socket is slow.
                            app_state.create_background_task(
                                simul.broadcast(
                                    {
                                        "type": "player_disconnected",
                                        "username": user.username,
                                        "group": removed_group,
                                    }
                                ),
                                name=f"simul-disconnect-broadcast-{simul_id}-{user.username}",
                            )
                break


async def process_message(
    app_state: PychessGlobalAppState, user: User, ws, data: SimulInboundMessage
) -> None:
    if data["type"] == "simul_user_connected":
        await handle_simul_user_connected(app_state, ws, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app_state, user, data)
    elif data["type"] == "start_simul":
        await handle_start_simul(app_state, ws, user, data)
    elif data["type"] == "join":
        await handle_join(app_state, user, ws, data)
    elif data["type"] == "approve_player":
        await handle_approve_player(app_state, user, data)
    elif data["type"] == "deny_player":
        await handle_deny_player(app_state, user, data)


async def get_simul(app_state: PychessGlobalAppState, simul_id: str):
    simul = app_state.simuls.get(simul_id)
    if simul is not None:
        return simul
    return await load_simul(app_state, simul_id)


async def handle_simul_user_connected(
    app_state: PychessGlobalAppState, ws, user: User, data: SimulUserConnectedRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if simulId not in user.simul_sockets:
        user.simul_sockets[simulId] = set()
    user.simul_sockets[simulId].add(ws)
    user.update_online()

    simul.add_spectator(user)

    response = {
        "type": "simul_user_connected",
        "simulId": simul.id,
        "players": simul.players_json(),
        "pendingPlayers": simul.pending_players_json(),
        "createdBy": simul.created_by,
        "name": simul.name,
        "description": simul.description,
        "variant": simul.variant,
        "chess960": simul.chess960,
        "base": simul.base,
        "inc": simul.inc,
        "status": simul.status,
        "hostColor": simul.host_color,
        "hostExtraTime": simul.host_extra_time,
        "hostExtraTimePerPlayer": simul.host_extra_time_per_player,
        "entryMinRating": simul.entry_min_rating,
        "entryMaxRating": simul.entry_max_rating,
        "entryMinRatedGames": simul.entry_min_rated_games,
        "entryMinAccountAgeDays": simul.entry_min_account_age_days,
        "createdAt": simul.created_at.isoformat(),
        "estimatedStartAt": (
            simul.estimated_start_at.isoformat() if simul.estimated_start_at is not None else None
        ),
        "startsAt": simul.starts_at.isoformat() if simul.starts_at is not None else None,
        "endsAt": simul.ends_at.isoformat() if simul.ends_at is not None else None,
        "games": simul.all_games_json(),
        "username": user.username,
    }
    await ws_send_json(ws, response)
    await ws_send_json(ws, {"type": "fullchat", "lines": list(simul.tourneychat)})


async def handle_start_simul(
    app_state: PychessGlobalAppState, ws, user: User, data: SimulStartRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    started = await simul.start()
    if not started:
        message = "Cannot start simul without opponents"
        if len(simul.players) >= 2 and not simul.host_extra_time_valid():
            message = "Invalid host extra time for this clock setup"
        await ws_send_json(ws, {"type": "error", "message": message})


async def handle_join(
    app_state: PychessGlobalAppState, user: User, ws, data: SimulJoinRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    error = simul.entry_condition_error(user)
    if error is not None:
        await ws_send_json(ws, {"type": "error", "message": error})
        return

    if simul.join(user):
        await upsert_simul_to_db(simul, app_state)
        await simul.broadcast({"type": "player_joined", "player": simul.player_json(user)})


async def handle_approve_player(
    app_state: PychessGlobalAppState, user: User, data: SimulApprovePlayerRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    username = data.get("username")
    if simul.approve(username):
        await upsert_simul_to_db(simul, app_state)
        if username is None:
            return
        approved_player = simul.players.get(username)
        if approved_player is None:
            return
        await simul.broadcast(
            {"type": "player_approved", "player": simul.player_json(approved_player)}
        )


async def handle_deny_player(
    app_state: PychessGlobalAppState, user: User, data: SimulDenyPlayerRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    username = data.get("username")
    if simul.deny(username):
        await upsert_simul_to_db(simul, app_state)
        await simul.broadcast({"type": "player_denied", "username": username})


async def handle_lobbychat(
    app_state: PychessGlobalAppState, user: User, data: SimulLobbyChatMessage
) -> None:
    simul_id = data["simulId"]
    simul = await get_simul(app_state, simul_id)
    if simul is None or user.anon or user.silence != 0:
        return

    message = sanitize_user_message(data["message"])
    if not app_state.chat_flood.allow_message(f"public:{user.username}", message):
        return

    response = chat_response("lobbychat", user.username, message)
    await simul.simul_chat_save(response)
    await simul.broadcast(response)
