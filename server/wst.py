from datetime import datetime, timezone
import json
import logging

import aiohttp
from aiohttp import web
import aiohttp_session

from typedefs import (
    lobbysockets_key,
    shield_owners_key,
    users_key,
    tourneychat_key,
    tourneysockets_key,
)
from admin import silence
from chat import chat_response
from const import ANON_PREFIX, STARTED, SHIELD
from settings import TOURNAMENT_DIRECTORS
from utils import MyWebSocketResponse, online_count
from tournaments import load_tournament
from tournament import T_CREATED, T_STARTED
from broadcast import lobby_broadcast
from websocket_utils import process_ws, get_user

log = logging.getLogger(__name__)


async def tournament_socket_handler(request):
    session = await aiohttp_session.get_session(request)
    user = await get_user(session, request)
    ws = await process_ws(session, request, user, process_message)
    if ws is None:
        return web.HTTPFound("/")
    await finally_logic(request.app, ws, user)
    return ws


async def finally_logic(app, ws, user):
    users = app[users_key]

    sockets = app[tourneysockets_key]
    lobby_sockets = app[lobbysockets_key]

    if user is not None:
        for tournamentId in user.tournament_sockets:
            if ws in user.tournament_sockets[tournamentId]:
                user.tournament_sockets[tournamentId].remove(ws)

                if len(user.tournament_sockets[tournamentId]) == 0:
                    del user.tournament_sockets[tournamentId]
                    user.update_online()

                    if tournamentId in sockets and user.username in sockets[tournamentId]:
                        del sockets[tournamentId][user.username]
                        tournament = await load_tournament(app, tournamentId)
                        tournament.spactator_leave(user)
                        await tournament.broadcast(tournament.spectator_list)

                    if not user.online:
                        response = {"type": "u_cnt", "cnt": online_count(users)}
                        await lobby_broadcast(lobby_sockets, response)
                break


async def process_message(app, user, ws, data):
    users = app[users_key]

    sockets = app[tourneysockets_key]
    lobby_sockets = app[lobbysockets_key]
    tourneychat = app[tourneychat_key]

    if data["type"] == "get_players":
        await handle_get_players(app, ws, user, data)
    elif data["type"] == "my_page":
        await handle_my_page(app, ws, user, data)
    elif data["type"] == "get_games":
        await handle_get_games(app, ws, data)
    elif data["type"] == "join":
        await handle_join(app, ws, user, data)
    elif data["type"] == "pause":
        await handle_pause(app, ws, user, data)
    elif data["type"] == "withdraw":
        await handle_withdraw(app, ws, user, data)
    elif data["type"] == "tournament_user_connected":
        await handle_user_connected(app, ws, lobby_sockets, sockets, users, tourneychat, user, data)
    elif data["type"] == "lobbychat":
        await handle_lobbychat(app, users, tourneychat, user, data)

async def handle_get_players(app, ws, user, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        page = data["page"]
        if user in tournament.players and tournament.players[user].page != page:
            tournament.players[user].page = page
        response = tournament.players_json(page=page)
        await ws.send_json(response)

async def handle_my_page(app, ws, user, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        if user in tournament.players:
            # force to get users current page by leaderbord status
            tournament.players[user].page = -1
        response = tournament.players_json(user=user)
        await ws.send_json(response)

async def handle_get_games(app, ws, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        response = await tournament.games_json(data["player"])
        await ws.send_json(response)

async def handle_join(app, ws, user, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        await tournament.join(user)
        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws.send_json(response)

async def handle_pause(app, ws, user, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        await tournament.pause(user)
        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws.send_json(response)

async def handle_withdraw(app, ws, user, data):
    tournament = await load_tournament(app, data["tournamentId"])
    if tournament is not None:
        await tournament.withdraw(user)
        response = {
            "type": "ustatus",
            "username": user.username,
            "ustatus": tournament.user_status(user),
        }
        await ws.send_json(response)

async def handle_user_connected(app, ws, lobby_sockets, sockets, users, tourneychat, user, data):
    tournamentId = data["tournamentId"]
    tournament = await load_tournament(app, tournamentId)
    if tournament is None:
        return

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
        "secondsToStart": (tournament.starts_at - now).total_seconds()
        if tournament.starts_at > now
        else 0,
        "secondsToFinish": (tournament.ends_at - now).total_seconds()
        if tournament.starts_at < now
        else 0,
    }
    if tournament.frequency == SHIELD:
        variant_name = tournament.variant + (
            "960" if tournament.chess960 else ""
        )
        defender = await users.get(app[shield_owners_key][variant_name])
        response["defender_title"] = defender.title
        response["defender_name"] = defender.username

    await ws.send_json(response)

    if (tournament.top_game is not None) and (
            tournament.top_game.status <= STARTED
    ):
        await ws.send_json(tournament.top_game_json)

    if tournament.status > T_STARTED:
        await ws.send_json(tournament.summary)

    response = {
        "type": "fullchat",
        "lines": list(tourneychat[tournamentId]),
    }
    await ws.send_json(response)

    if user.username not in tournament.spectators:
        tournament.spactator_join(user)
        await tournament.broadcast(tournament.spectator_list)

    if len(user.game_sockets) == 0 and len(user.lobby_sockets) == 0:
        response = {"type": "u_cnt", "cnt": online_count(users)}
        await lobby_broadcast(lobby_sockets, response)

async def handle_lobbychat(app, users, tourneychat, user, data):
    if user.username.startswith(ANON_PREFIX):
        return

    tournamentId = data["tournamentId"]
    tournament = await load_tournament(app, tournamentId)
    message = data["message"]
    response = None

    if user.username in TOURNAMENT_DIRECTORS:
        if message.startswith("/silence"):
            response = silence(message, tourneychat[tournamentId], users)
            # silence message was already added to lobbychat in silence()

        elif message.startswith("/abort"):
            if tournament.status in (T_CREATED, T_STARTED):
                await tournament.abort()
        else:
            response = chat_response(
                "lobbychat", user.username, data["message"]
            )
            tourneychat[tournamentId].append(response)

    elif user.anon:
        pass

    else:
        if user.silence == 0:
            response = chat_response(
                "lobbychat", user.username, data["message"]
            )
            tourneychat[tournamentId].append(response)

    if response is not None:
        await tournament.broadcast(response)