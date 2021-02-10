import logging

from aiohttp import web
import aioauth_client
import aiohttp_session

from broadcast import round_broadcast
from const import STARTED
from settings import CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REDIRECT_PATH, DEV_TOKEN1, DEV_TOKEN2

log = logging.getLogger(__name__)

RESERVED_USERS = ("Random-Mover", "Fairy-Stockfish", "Discord-Relay", "Invite-friend")


async def oauth(request):
    """ Get lichess.org oauth token. """
    # TODO: check https://lichess.org/api/user/{username}
    # see https://lichess.org/api#operation/apiUser
    # and disable login if engine or booster is true or user is disabled
    client = aioauth_client.LichessClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )
    code = request.rel_url.query.get("code")
    print("OAUTH code", code)
    if code is None:
        raise web.HTTPFound(client.get_authorize_url(
            # scope="email:read",
            redirect_uri=REDIRECT_URI
        ))
    else:
        try:
            token_data = await client.get_access_token(
                code,
                redirect_uri=REDIRECT_URI
            )
            token, data = token_data
            session = await aiohttp_session.get_session(request)
            session["token"] = token
        except Exception:
            log.error("Failed to get oauth access token.")

        raise web.HTTPFound("/login")


async def login(request):
    """ Login with lichess.org oauth. """
    if REDIRECT_PATH is None:
        log.error("Set REDIRECT_PATH env var if you want lichess OAuth login!")
        raise web.HTTPFound("/")

    # TODO: flag and ratings using lichess.org API
    session = await aiohttp_session.get_session(request)

    if DEV_TOKEN1 and DEV_TOKEN2:
        if "dev_token" in request.app:
            session["token"] = DEV_TOKEN2
        else:
            session["token"] = DEV_TOKEN1
        request.app["dev_token"] = True

    if "token" not in session:
        raise web.HTTPFound(REDIRECT_PATH)

    client = aioauth_client.LichessClient(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        access_token=session["token"])

    try:
        user, info = await client.user_info()
    except Exception:
        log.error("Failed to get user info from lichess.org")
        log.exception("ERROR: Exception in login(request) user, info = await client.user_info()!")
        raise web.HTTPFound("/")

    if user.username in RESERVED_USERS:
        log.error("User %s tried to log in.", user.username)
        raise web.HTTPFound("/")

    title = user.gender if user.gender is not None else ""
    if title == "BOT":
        log.error("BOT user %s tried to log in.", user.username)
        raise web.HTTPFound("/")

    log.info("+++ Lichess authenticated user: %s %s %s", user.id, user.username, user.country)
    users = request.app["users"]

    prev_session_user = session.get("user_name")
    prev_user = users.get(prev_session_user)
    if prev_user is not None:
        prev_user.lobby_sockets = set()  # make it offline

    session["user_name"] = user.username
    session["country"] = user.country
    session["first_name"] = user.first_name
    session["last_name"] = user.last_name
    session["title"] = title

    if user.username:
        db = request.app["db"]
        doc = await db.user.find_one({"_id": user.username})
        if doc is None:
            result = await db.user.insert_one({
                "_id": user.username,
                "first_name": session.get("first_name"),
                "last_name": session.get("last_name"),
                "country": session.get("country"),
                "title": session.get("title"),
                "perfs": {},
            })
            print("db insert user result %s" % repr(result.inserted_id))
        elif not doc.get("enabled", True):
            log.info("Closed account %s tried to log in.", user.username)
            session["user_name"] = prev_session_user

        del session["token"]

    raise web.HTTPFound("/")


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
            await ws.send_json(response)

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

    raise web.HTTPFound("/")
