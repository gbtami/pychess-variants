import os
import base64
import hashlib
import secrets
from urllib.parse import urlencode

import aiohttp
import aiohttp_session
from aiohttp import web

from broadcast import round_broadcast
from const import NONE_USER, STARTED
from settings import DEV, URI
from pychess_global_app_state_utils import get_app_state
from websocket_utils import ws_send_json
from logger import log


RESERVED_USERS = (
    "Random-Mover",
    "Fairy-Stockfish",
    "Discord-Relay",
    "Invite-friend",
    "PyChess",
    NONE_USER,
)


async def oauth(request):
    """Get oauth token with PKCE"""

    provider = request.match_info.get("provider")
    redirect_uri = URI + ("/oauth" if provider is None else "/oauth/%s" % provider)

    if provider is None:
        CLIENT_ID = os.getenv("CLIENT_ID", "pychess")
        CLIENT_SECRET = os.getenv("CLIENT_SECRET", "secret")

        OAUTH_AUTHORIZE_URL = "https://lichess.org/oauth"
        OAUTH_TOKEN_URL = "https://lichess.org/api/token"
        scopes = "email:read"

    elif provider == "google":
        CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "pychess")
        CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "secret")

        OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
        OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"

        scopes = " ".join([
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "openid",
        ])

    elif provider == "chessdotcom":
        CLIENT_ID = os.getenv("CLIENT_ID", "pychess")
        CLIENT_SECRET = os.getenv("CLIENT_SECRET", "secret")

        OAUTH_AUTHORIZE_URL = "https://oauth.chess.com/authorize"
        OAUTH_TOKEN_URL = "https://oauth.chess.com/token"
        scopes = "openid profile email"

    session = await aiohttp_session.get_session(request)
    code = request.rel_url.query.get("code")

    if code is None:
        code_verifier = secrets.token_urlsafe(64)
        session["oauth_code_verifier"] = code_verifier
        code_challenge = get_code_challenge(code_verifier)

        authorize_url = (
            OAUTH_AUTHORIZE_URL
            + "?"
            + urlencode(
                {
                    "state": CLIENT_SECRET,
                    "client_id": CLIENT_ID,
                    "response_type": "code",
                    "redirect_uri": redirect_uri,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                    "scope": scopes,
                }
            )
        )
        return web.HTTPFound(authorize_url)
    else:
        state = request.rel_url.query.get("state")
        if state != CLIENT_SECRET:
            log.error("State got back from %s changed", OAUTH_AUTHORIZE_URL)
            return web.HTTPFound("/")

        if "oauth_code_verifier" not in session:
            log.error("No oauth_code_verifier in session")
            return web.HTTPFound("/")

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": session["oauth_code_verifier"],
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": redirect_uri,
        }

        async with aiohttp.ClientSession() as client_session:
            async with client_session.post(OAUTH_TOKEN_URL, json=data) as resp:
                data = await resp.json()
                print("OAUTH_DATA=", data)
                token = data.get("access_token")
                if token is not None:
                    session["token"] = token
                    return web.HTTPFound("/login" if provider is None else "/login/%s" % provider)
                else:
                    log.error(
                        "Failed to get OAuth token from %s",
                        OAUTH_TOKEN_URL,
                    )
                    return web.HTTPFound("/")


async def login(request):
    session = await aiohttp_session.get_session(request)

    provider = request.match_info.get("provider")
    redirect_path = "/oauth" if provider is None else "/oauth/%s" % provider

    if "token" not in session:
        return web.HTTPFound(redirect_path)

    if provider is None:
        account_api_url = "https://lichess.org/api/account"

    elif provider == "google":
        account_api_url = "https://www.googleapis.com/oauth2/v2/userinfo"

    elif provider == "chessdotcom":
        account_api_url = "https://api.chess.com/pub/player"

    user_data = await get_user_data(account_api_url, session["token"])

    if provider is None:
        email_data = await get_user_data(account_api_url + "/email", session["token"])
        email = email_data.get("email")
    else:
        email = user_data.get("email")
    print("EMAIL=", email)

    _id = user_data.get("id")
    username = user_data.get("username", _id)
    title = user_data.get("title", "")
    closed = user_data.get("closed", "")
    tosViolation = user_data.get("tosViolation", "")

    if email is None:
        log.error(
            "Failed to get public user account data from %s",
            account_api_url,
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

    log.info("+++ authenticated user: %s", username)
    app_state = get_app_state(request.app)
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


async def get_user_data(url, token):
    async with aiohttp.ClientSession() as client_session:
        data = {"Authorization": "Bearer %s" % token}
        async with client_session.get(url, headers=data) as resp:
            data = await resp.json()
            print("USER_DATA", data)
            return data


async def logout(request, user=None):
    if request is not None:
        # user clicked the logout
        app_state = get_app_state(request.app)
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        user = await app_state.users.get(session_user)
    else:
        # admin banned the user
        app_state = user.app_state

    if user is None:
        return web.HTTPFound("/")
    response = {"type": "logout"}

    # close lobby socket
    ws_set = user.lobby_sockets
    for ws in list(ws_set):
        await ws_send_json(ws, response)

    # close tournament sockets
    for ws_set in user.tournament_sockets.values():
        for ws in list(ws_set):
            await ws_send_json(ws, response)

    # lose and close game sockets when ban() calls this from admin.py
    # TODO: this can't end game if logout came from an ongoing game
    # because its ws was already closed and removed from game_sockets
    if not user.enabled:
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
