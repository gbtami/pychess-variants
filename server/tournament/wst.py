from __future__ import annotations
from typing import TYPE_CHECKING
from datetime import datetime, timezone

import aiohttp_session
from aiohttp import web

from admin import silence
from chat import chat_response
from const import ANON_PREFIX, SHIELD
import logger

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
    from user import User
    from ws_types import (
        TournamentGetGamesMessage,
        TournamentGetPlayersMessage,
        TournamentInboundMessage,
        TournamentJoinMessage,
        TournamentLobbyChatMessage,
        TournamentMyPageMessage,
        TournamentPauseMessage,
        TournamentUserConnectedRequest,
        TournamentWithdrawMessage,
    )
from pychess_global_app_state_utils import get_app_state
from settings import TOURNAMENT_DIRECTORS
from tournament.tournament import T_CREATED, T_STARTED
from tournament.tournaments import load_tournament
from ws_types import ChatMessage, TournamentUserConnectedMessage
from websocket_utils import process_ws, get_user, ws_send_json


async def tournament_socket_handler(request):
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)
    logger.set_log_context("username", user.username)
    logger.set_log_context(
        "gameId", "arena"
    )  # todo: we don't have tournamentId at this point, otherwise could put it here
    ws = await process_ws(session, request, user, None, process_message)
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(app_state, ws, user)
    return ws


async def finally_logic(app_state: PychessGlobalAppState, ws, user):
    if user is not None:
        for tournamentId in user.tournament_sockets:
            if ws in user.tournament_sockets[tournamentId]:
                user.tournament_sockets[tournamentId].remove(ws)

                if len(user.tournament_sockets[tournamentId]) == 0:
                    del user.tournament_sockets[tournamentId]
                    user.update_online()

                    if (
                        tournamentId in app_state.tourneysockets
                        and user.username in app_state.tourneysockets[tournamentId]
                    ):
                        del app_state.tourneysockets[tournamentId][user.username]
                        tournament = await load_tournament(app_state, tournamentId)
                        if TYPE_CHECKING:
                            assert tournament is not None
                        tournament.spactator_leave(user)
                        await tournament.broadcast(tournament.spectator_list)

                    if not user.online:
                        await app_state.lobby.lobby_broadcast_u_cnt()
                break


async def process_message(
    app_state: PychessGlobalAppState, user: User, ws, data: TournamentInboundMessage
) -> None:
    if data["type"] == "get_players":
        await handle_get_players(app_state, ws, user, data)
    elif data["type"] == "my_page":
        await handle_my_page(app_state, ws, user, data)
    elif data["type"] == "get_games":
        await handle_get_games(app_state, ws, data)
    elif data["type"] == "join":
        await handle_join(app_state, ws, user, data)
    elif data["type"] == "pause":
        await handle_pause(app_state, ws, user, data)
    elif data["type"] == "withdraw":
        await handle_withdraw(app_state, ws, user, data)
    elif data["type"] == "tournament_user_connected":
        await handle_user_connected(app_state, ws, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app_state, user, data)


async def handle_get_players(
    app: PychessGlobalAppState, ws, user: User, data: TournamentGetPlayersMessage
) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        page = data["page"]
        if user in tournament.players and tournament.players[user].page != page:
            tournament.players[user].page = page
        response = tournament.players_json(page=page)
        await ws_send_json(ws, response)


async def handle_my_page(
    app: PychessGlobalAppState, ws, user: User, data: TournamentMyPageMessage
) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        if user in tournament.players:
            # force to get users current page by leaderboard status
            tournament.players[user].page = -1
        response = tournament.players_json(user=user)
        await ws_send_json(ws, response)


async def handle_get_games(app: PychessGlobalAppState, ws, data: TournamentGetGamesMessage) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        response = await tournament.games_json(data["player"])
        await ws_send_json(ws, response)


async def handle_join(
    app: PychessGlobalAppState, ws, user: User, data: TournamentJoinMessage
) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        password = data.get("password")
        result = await tournament.join(user, password)
        if result == "401":
            response = {"type": "error", "message": "Incorrect password"}
            await ws_send_json(ws, response)
            return

        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws_send_json(ws, response)


async def handle_pause(
    app: PychessGlobalAppState, ws, user: User, data: TournamentPauseMessage
) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        await tournament.pause(user)
        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws_send_json(ws, response)


async def handle_withdraw(
    app: PychessGlobalAppState, ws, user: User, data: TournamentWithdrawMessage
) -> None:
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        await tournament.withdraw(user)
        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws_send_json(ws, response)


async def handle_user_connected(
    app_state: PychessGlobalAppState, ws, user: User, data: TournamentUserConnectedRequest
) -> None:
    tournamentId = data["tournamentId"]
    tournament = await load_tournament(app_state, tournamentId)
    if tournament is None:
        return

    # update websocket
    if tournamentId not in user.tournament_sockets:
        user.tournament_sockets[tournamentId] = set()
    user.tournament_sockets[tournamentId].add(ws)

    user.update_online()

    app_state.tourneysockets[tournamentId][user.username] = user.tournament_sockets[tournamentId]

    now = datetime.now(timezone.utc)
    response: TournamentUserConnectedMessage = {
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
        "secondsToStart": (
            (tournament.starts_at - now).total_seconds() if tournament.starts_at > now else 0
        ),
        "secondsToFinish": (
            (tournament.ends_at - now).total_seconds() if tournament.starts_at < now else 0
        ),
        "chatClosed": (now - tournament.ends_at).total_seconds() > 60 * 60,
        "private": bool(tournament.password),
    }
    if tournament.frequency == SHIELD:
        variant_name = tournament.variant + ("960" if tournament.chess960 else "")
        defender = await app_state.users.get(app_state.shield_owners[variant_name])
        response["defender_title"] = defender.title
        response["defender_name"] = defender.username

    await ws_send_json(ws, response)

    if tournament.status > T_STARTED:
        await ws_send_json(ws, tournament.summary)
    elif tournament.top_game is not None:
        await ws_send_json(ws, tournament.top_game_json)

    fullchat_response = {"type": "fullchat", "lines": list(tournament.tourneychat)}
    await ws_send_json(ws, fullchat_response)

    await ws_send_json(ws, tournament.duels_json)

    if user.username not in tournament.spectators:
        tournament.spactator_join(user)
        await tournament.broadcast(tournament.spectator_list)

    if not user.is_user_active_in_game() and len(user.lobby_sockets) == 0:
        await app_state.lobby.lobby_broadcast_u_cnt()


async def handle_lobbychat(
    app_state: PychessGlobalAppState, user: User, data: TournamentLobbyChatMessage
) -> None:
    if user.username.startswith(ANON_PREFIX):
        return

    tournamentId = data["tournamentId"]
    tournament = await load_tournament(app_state, tournamentId)
    if TYPE_CHECKING:
        assert tournament is not None
    message = data["message"]
    response: ChatMessage | dict[str, object] | None = None

    if user.username in TOURNAMENT_DIRECTORS:
        if message.startswith("/silence"):
            response = silence(message, app_state.tourneychat[tournamentId], app_state.users)  # type: ignore[call-arg]
            # silence message was already added to lobbychat in silence()

        elif message.startswith("/abort"):
            if tournament.status in (T_CREATED, T_STARTED):
                await tournament.abort()

        else:
            response = chat_response("lobbychat", user.username, data["message"])
            await tournament.tourney_chat_save(response)

    elif user.anon:
        pass

    else:
        if user.silence == 0:
            response = chat_response("lobbychat", user.username, data["message"])
            await tournament.tourney_chat_save(response)

    if response is not None:
        await tournament.broadcast(response)
