import logging
import secrets
import hashlib
import base64
from urllib.parse import urlencode

import aiohttp
from aiohttp import web
import aiohttp_session

from broadcast import round_broadcast
from const import STARTED
from settings import CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH, \
    LICHESS_OAUTH_AUTHORIZE_URL, LICHESS_OAUTH_TOKEN_URL, LICHESS_ACCOUNT_API_URL, DEV

log = logging.getLogger(__name__)

RESERVED_USERS = ("Random-Mover", "Fairy-Stockfish", "Discord-Relay", "Invite-friend")


async def oauth(request):
    """ Get lichess.org oauth token with PKCE """

    session = await aiohttp_session.get_session(request)
    code = request.rel_url.query.get("code")

    if code is None:
        code_verifier = secrets.token_urlsafe(64)
        session['oauth_code_verifier'] = code_verifier
        code_challenge = get_code_challenge(code_verifier)

        authorize_url = LICHESS_OAUTH_AUTHORIZE_URL + '/?' + urlencode({
            'state': CLIENT_SECRET,
            'client_id': CLIENT_ID,
            'response_type': 'code',
            'redirect_uri': REDIRECT_URI,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
        })
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
            "code_verifier": session['oauth_code_verifier'],
            'client_id': CLIENT_ID,
            'redirect_uri': REDIRECT_URI,
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
                    log.error("Failed to get lichess OAuth token from %s", LICHESS_OAUTH_TOKEN_URL)
                    return web.HTTPFound("/")


async def login(request):
    """ Login with lichess.org oauth. """
    if REDIRECT_PATH is None:
        log.error("Set REDIRECT_PATH env var if you want lichess OAuth login!")
        return web.HTTPFound("/")

    session = await aiohttp_session.get_session(request)

    if "token" not in session:
        return web.HTTPFound(REDIRECT_PATH)

    username = None
    title = ""
    disabled = ""
    tosViolation = ""

    async with aiohttp.ClientSession() as client_session:
        data = {'Authorization': "Bearer %s" % session["token"]}
        async with client_session.get(LICHESS_ACCOUNT_API_URL, headers=data) as resp:
            data = await resp.json()
            username = data.get("username")
            title = data.get("title", "")
            disabled = data.get("disabled", "")
            tosViolation = data.get("tosViolation", "")
            if username is None:
                log.error("Failed to get lichess public user account data from %s", LICHESS_ACCOUNT_API_URL)
                return web.HTTPFound("/")

    if username in RESERVED_USERS:
        log.error("User %s tried to log in.", username)
        return web.HTTPFound("/")

    elif (not DEV) and title == "BOT":
        log.error("BOT user %s tried to log in.", username)
        return web.HTTPFound("/")

    elif tosViolation == "true":
        log.error("tosViolation user %s tried to log in.", username)
        return web.HTTPFound("/")

    elif disabled == "true":
        log.error("disabled user %s tried to log in.", username)
        return web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s", username)
    users = request.app["users"]

    prev_session_user = session.get("user_name")
    prev_user = users.get(prev_session_user)
    if prev_user is not None:
        prev_user.lobby_sockets = set()  # make it offline
        prev_user.game_sockets = {}
        prev_user.update_online()

    session["user_name"] = username
    session["title"] = title

    if username:
        db = request.app["db"]
        doc = await db.user.find_one({"_id": username})
        if doc is None:
            result = await db.user.insert_one({
                "_id": username,
                "title": session.get("title"),
                "perfs": {},
            })
            print("db insert user result %s" % repr(result.inserted_id))
        elif not doc.get("enabled", True):
            log.info("Closed account %s tried to log in.", username)
            session["user_name"] = prev_session_user

        del session["token"]

    return web.HTTPFound("/")


async def logout(request):
    users = request.app["users"]

    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = users.get(session_user)

    # close lobby socket
    if session_user in request.app["lobbysockets"]:
        ws_set = request.app["lobbysockets"][session_user]
        response = {"type": "logout"}
        for ws in ws_set:
            try:
                await ws.send_json(response)
            except ConnectionResetError:
                pass

    # lose and close game sockets
    # TODO: this can't end game if logout came from an ongoing game
    # because its ws was already closed and removed from game_sockets
    if user is not None:
        for gameId in user.game_sockets:
            if gameId in request.app["games"]:
                game = request.app["games"][gameId]
                if game.status <= STARTED:
                    response = await game.game_ended(user, "abandone")
                    await round_broadcast(game, users, response, full=True)

    session.invalidate()

    return web.HTTPFound("/")


def get_code_challenge(code_verifier):
    hashed = hashlib.sha256(code_verifier.encode('ascii')).digest()
    encoded = base64.urlsafe_b64encode(hashed)
    return encoded.decode('ascii')[:-1]
