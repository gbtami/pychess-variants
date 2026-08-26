from __future__ import annotations

import re
from typing import TYPE_CHECKING

import aiohttp_session
from aiohttp import web
from chat import chat_response
from const import T_CREATED
from link_filter import sanitize_user_message
from pychess_global_app_state_utils import get_app_state
from websocket_utils import get_user, process_ws, ws_send_json

from simul.simuls import load_simul, mark_simul_host_seen, upsert_simul_to_db

SIMUL_ERROR_CODES = {
    "Anonymous users cannot join simuls.": "anonymous_cannot_join",
    "BOT accounts cannot join simuls.": "bot_cannot_join",
    "Choose one of the variants offered by this simul.": "choose_variant",
    "This variant is not offered by this simul.": "variant_not_offered",
    "Your rating is below the minimum allowed for this simul.": "rating_too_low",
    "Your rating is above the maximum allowed for this simul.": "rating_too_high",
    "This simul has already started": "already_started",
    "Cannot start simul with fewer than 2 opponents": "too_few_opponents",
    "Invalid host extra time for this clock setup": "invalid_host_extra_time",
    "Cannot start simul": "cannot_start",
}


def simul_error_payload(message: str) -> dict[str, object]:
    payload: dict[str, object] = {"type": "error", "message": message}
    code = SIMUL_ERROR_CODES.get(message)
    if code is not None:
        payload["code"] = code
        return payload

    match = re.fullmatch(r"This simul already has the maximum of (\d+) accepted players\.", message)
    if match:
        payload.update(code="capacity_reached", count=int(match.group(1)))
        return payload
    match = re.fullmatch(r"This simul requires at least (\d+) rated (.+) games\.", message)
    if match:
        payload.update(code="min_rated_games", count=int(match.group(1)), variant=match.group(2))
        return payload
    match = re.fullmatch(r"This simul requires accounts to be at least (\d+) days old\.", message)
    if match:
        payload.update(code="min_account_age", count=int(match.group(1)))
        return payload
    match = re.fullmatch(r"You must be a member of (.+) to join this simul\.", message)
    if match:
        payload.update(code="team_membership_required", team=match.group(1))
        return payload
    match = re.fullmatch(r"Cannot start simul with more than (\d+) opponents", message)
    if match:
        payload.update(code="too_many_opponents", count=int(match.group(1)))
    return payload


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
        SimulWithdrawRequest,
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
                        if (
                            user.username == simul.created_by
                            and simul.status == T_CREATED
                            and simul.featurable
                        ):
                            await simul.broadcast_spotlight()
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
    elif data["type"] == "withdraw":
        await handle_withdraw(app_state, user, data)
    elif data["type"] == "approve_player":
        await handle_approve_player(app_state, ws, user, data)
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

    if user.username == simul.created_by and simul.status == T_CREATED:
        await mark_simul_host_seen(simul)

    simul.add_spectator(user)
    if user.username == simul.created_by and simul.status == T_CREATED and simul.featurable:
        await simul.broadcast_spotlight()

    response = {
        "type": "simul_user_connected",
        "simulId": simul.id,
        "players": simul.players_json(),
        "pendingPlayers": simul.pending_players_json(),
        "createdBy": simul.created_by,
        "name": simul.name,
        "description": simul.description,
        "fen": simul.fen,
        "variants": simul.variants,
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
        "entryTeamId": simul.entry_team_id,
        "entryTeamName": simul.entry_team_name,
        "createdAt": simul.created_at.isoformat(),
        "estimatedStartAt": (
            simul.estimated_start_at.isoformat() if simul.estimated_start_at is not None else None
        ),
        "startsAt": simul.starts_at.isoformat() if simul.starts_at is not None else None,
        "endsAt": simul.ends_at.isoformat() if simul.ends_at is not None else None,
        "games": simul.all_games_json(),
        "hostGameId": simul.host_game_id,
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
        await ws_send_json(
            ws,
            simul_error_payload(simul.start_error() or "Cannot start simul"),
        )


async def handle_join(
    app_state: PychessGlobalAppState, user: User, ws, data: SimulJoinRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    variant = data.get("variant")
    error = await simul.entry_condition_error(user, variant)
    if (
        error is None
        and user.username not in simul.players
        and user.username not in simul.pending_players
    ):
        error = simul.capacity_error()
    if error is not None:
        await ws_send_json(ws, simul_error_payload(error))
        return

    if simul.join(user, variant):
        await upsert_simul_to_db(simul, app_state)
        await app_state.timeline.publish(
            "simul-join",
            user,
            {"simulId": simul.id, "name": simul.name},
        )
        if variant is None:
            variant = simul.primary_variant_key
        await simul.broadcast({"type": "player_joined", "player": simul.player_json(user, variant)})
        if simul.featurable:
            await simul.broadcast_spotlight()


async def handle_withdraw(
    app_state: PychessGlobalAppState, user: User, data: SimulWithdrawRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if simul.withdraw(user):
        await upsert_simul_to_db(simul, app_state)
        await simul.broadcast({"type": "player_withdrawn", "username": user.username})
        if simul.featurable:
            await simul.broadcast_spotlight()


async def handle_approve_player(
    app_state: PychessGlobalAppState, ws, user: User, data: SimulApprovePlayerRequest
) -> None:
    simulId = data["simulId"]
    simul = await get_simul(app_state, simulId)
    if simul is None:
        return

    if user.username != simul.created_by:
        return

    username = data.get("username")
    capacity_error = simul.capacity_error()
    if username in simul.pending_players and capacity_error is not None:
        await ws_send_json(ws, simul_error_payload(capacity_error))
        return

    if simul.approve(username):
        await upsert_simul_to_db(simul, app_state)
        if username is None:
            return
        approved_player = simul.players.get(username)
        if approved_player is None:
            return
        variant = simul.player_variants.get(username, simul.primary_variant_key)
        await simul.broadcast(
            {
                "type": "player_approved",
                "player": simul.player_json(approved_player, variant),
            }
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
        if simul.featurable:
            await simul.broadcast_spotlight()


async def handle_lobbychat(
    app_state: PychessGlobalAppState, user: User, data: SimulLobbyChatMessage
) -> None:
    simul_id = data.get("simulId")
    if simul_id is None:
        return
    simul = await get_simul(app_state, simul_id)
    if simul is None or user.anon or user.silence != 0:
        return

    message = sanitize_user_message(data["message"])
    if not app_state.chat_flood.allow_message(f"public:{user.username}", message):
        return

    response = chat_response("lobbychat", user.username, message)
    await simul.simul_chat_save(response)
    await simul.broadcast(response)
