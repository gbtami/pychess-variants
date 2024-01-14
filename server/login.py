from __future__ import annotations
import base64
import hashlib
import logging
import secrets
from urllib.parse import urlencode

import aiohttp
import aiohttp_session
from aiohttp import web

from broadcast import round_broadcast
from const import NONE_USER, STARTED
from settings import (
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    REDIRECT_PATH,
    LICHESS_OAUTH_AUTHORIZE_URL,
    LICHESS_OAUTH_TOKEN_URL,
    LICHESS_ACCOUNT_API_URL,
    DEV,
)
from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

RESERVED_USERS = (
    "Random-Mover",
    "Fairy-Stockfish",
    "Discord-Relay",
    "Invite-friend",
    "PyChess",
    NONE_USER,
)


async def oauth(request):
    """Get lichess.org oauth token with PKCE"""

    session = await aiohttp_session.get_session(request)
    code = request.rel_url.query.get("code")

    if code is None:
        code_verifier = secrets.token_urlsafe(64)
        session["oauth_code_verifier"] = code_verifier
        code_challenge = get_code_challenge(code_verifier)

        authorize_url = (
            LICHESS_OAUTH_AUTHORIZE_URL
            + "/?"
            + urlencode(
                {
                    "state": CLIENT_SECRET,
                    "client_id": CLIENT_ID,
                    "response_type": "code",
                    "redirect_uri": REDIRECT_URI,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                }
            )
        )
        return web.HTTPFound(authorize_url)
    else:
        state = request.rel_url.query.get("state")
        if state != CLIENT_SECRET:
            log.error("State got back from %s changed", LICHESS_OAUTH_AUTHORIZE_URL)
            return web.HTTPFound("/")

        if "oauth_code_verifier" not in session:
            log.error("No oauth_code_verifier in session")
            return web.HTTPFound("/")

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": session["oauth_code_verifier"],
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
        }

        async with aiohttp.ClientSession() as client_session:
            async with client_session.post(LICHESS_OAUTH_TOKEN_URL, json=data) as resp:
                data = await resp.json()
                token = data.get("access_token")
                if token is not None:
                    session["token"] = token
                    # TODO: "expires_in": 5270400
                    return web.HTTPFound("/login")
                else:
                    log.error(
                        "Failed to get lichess OAuth token from %s",
                        LICHESS_OAUTH_TOKEN_URL,
                    )
                    return web.HTTPFound("/")


async def login(request):
    """Login with lichess.org oauth."""
    app_state = get_app_state(request.app)
    if REDIRECT_PATH is None:
        log.error("Set REDIRECT_PATH env var if you want lichess OAuth login!")
        return web.HTTPFound("/")

    session = await aiohttp_session.get_session(request)

    if "token" not in session:
        return web.HTTPFound(REDIRECT_PATH)

    username = None
    title = ""
    closed = ""
    tosViolation = ""

    async with aiohttp.ClientSession() as client_session:
        data = {"Authorization": "Bearer %s" % session["token"]}
        async with client_session.get(LICHESS_ACCOUNT_API_URL, headers=data) as resp:
            data = await resp.json()
            username = data.get("username")
            title = data.get("title", "")
            closed = data.get("closed", "")
            tosViolation = data.get("tosViolation", "")
            if username is None:
                log.error(
                    "Failed to get lichess public user account data from %s",
                    LICHESS_ACCOUNT_API_URL,
                )
                return web.HTTPFound("/")

    if username.upper() in RESERVED_USERS:
        log.error("User %s tried to log in.", username)
        return web.HTTPFound("/")

    elif (not DEV) and title == "BOT":
        log.error("BOT user %s tried to log in.", username)
        return web.HTTPFound("/")

    elif tosViolation == "true":
        log.error("tosViolation user %s tried to log in.", username)
        return web.HTTPFound("/")

    elif closed == "true":
        log.error("closed user %s tried to log in.", username)
        return web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s", username)
    users = app_state.users

    prev_session_user = session.get("user_name")
    prev_user = await users.get(prev_session_user)
    if prev_user is not None:
        # todo: is consistency with app_state.lobby.lobbysockets lost here?
        #       also don't we want to close all these sockets - lobby, tournament and game?
        prev_user.lobby_sockets = set()  # make it offline
        prev_user.game_sockets = {}
        prev_user.tournament_sockets = {}
        prev_user.update_online()

    session["user_name"] = username
    session["title"] = title

    if username:
        doc = await app_state.db.user.find_one({"_id": username})
        if doc is None:
            result = await app_state.db.user.insert_one(
                {
                    "_id": username,
                    "title": session.get("title"),
                    "perfs": {},
                    "pperfs": {},
                }
            )
            print("db insert user result %s" % repr(result.inserted_id))
        elif not doc.get("enabled", True):
            log.info("Closed account %s tried to log in.", username)
            session["user_name"] = prev_session_user

        del session["token"]

    return web.HTTPFound("/")


async def logout(request, user=None):
    app_state = get_app_state(request.app)
    if request is not None:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        user = await app_state.users.get(session_user)

    if user is None:
        return web.HTTPFound("/")
    response = {"type": "logout"}

    # close lobby socket
    ws_set = user.lobby_sockets
    for ws in ws_set:
        try:
            await ws.send_json(response)
        except ConnectionResetError as e:
            log.error(e, exc_info=True)

    # close tournament sockets
    for ws_set in user.tournament_sockets.values():
        for ws in ws_set:
            try:
                await ws.send_json(response)
            except ConnectionResetError as e:
                log.error(e, exc_info=True)

    # lose and close game sockets
    # TODO: this can't end game if logout came from an ongoing game
    # because its ws was already closed and removed from game_sockets
    for gameId in user.game_sockets:
        if gameId in app_state.games:
            game = app_state.games[gameId]
            if game.status <= STARTED:
                response = await game.game_ended(user, "abandon")
                await round_broadcast(game, response, full=True)

    if request is not None:
        session.invalidate()

    return web.HTTPFound("/")


def get_code_challenge(code_verifier):
    hashed = hashlib.sha256(code_verifier.encode("ascii")).digest()
    encoded = base64.urlsafe_b64encode(hashed)
    return encoded.decode("ascii")[:-1]
