from __future__ import annotations
import asyncio

from aiohttp import web

from broadcast import round_broadcast
from const import STARTED, RESIGN
from settings import BOT_TOKENS
from user import User
from utils import play_move
from pychess_global_app_state_utils import get_app_state
from logger import log


def authorized(func):
    """Authorization decorator"""

    async def inner(request):
        auth = request.headers.get("Authorization")

        if auth is None:
            log.error("BOT request without Authorization header!")
            raise web.HTTPForbidden()

        token = auth[auth.find("Bearer") + 7 :]
        if token not in BOT_TOKENS:
            log.error("BOT account token %s is not in BOT_TOKENS!", token)
            raise web.HTTPForbidden()

        func.__globals__["username"] = BOT_TOKENS[token]
        response = await func(request)
        return response

    return inner


async def bot_token_test(request):
    text = await request.text()
    tokens = text.split(",")

    response = {}
    for token in tokens:
        if token in BOT_TOKENS:
            response[token] = {
                "scopes": "bot:play",
                "userId": BOT_TOKENS[token],
                "expires": 1358509698620,
            }
        else:
            response[token] = None

    return web.json_response(response)


@authorized
async def account(request):
    return web.json_response({"id": username, "username": username, "title": "BOT"})  # noqa: F821


@authorized
async def playing(request):
    resp = {"nowPlaying": []}
    return web.json_response(resp)


@authorized
async def challenge_create(request):
    return web.json_response({"ok": True})


@authorized
async def challenge_accept(request):
    return web.json_response({"ok": True})


@authorized
async def challenge_decline(request):
    return web.json_response({"ok": True})


@authorized
async def event_stream(request):
    app_state = get_app_state(request.app)

    resp = web.StreamResponse()
    resp.content_type = "application/x-ndjson"
    await resp.prepare(request)

    if username in app_state.users:  # noqa: F821
        bot_player = app_state.users[username]  # noqa: F821
        # After BOT lost connection it may have ongoing games
        # We notify BOT and he can ask to create new game_streams
        # to continue those games
        for gameId in bot_player.game_queues:
            if gameId in app_state.games and app_state.games[gameId].status == STARTED:
                await bot_player.event_queue.put(app_state.games[gameId].game_start)
    else:
        bot_player = User(app_state, bot=True, username=username)  # noqa: F821
        app_state.users[bot_player.username] = bot_player

        doc = await app_state.db.user.find_one({"_id": username})  # noqa: F821
        if doc is None:
            result = await app_state.db.user.insert_one(
                {
                    "_id": username,  # noqa: F821
                    "title": "BOT",
                }
            )
            print("db insert user result %s" % repr(result.inserted_id))

    bot_player.online = True

    log.info("+++ BOT %s connected", bot_player.username)

    async def pinger():
        """To prevent lichess-bot.py sleep by heroku because of no activity."""
        while True:
            await bot_player.event_queue.put('{"type":"ping"}\n')
            await asyncio.sleep(6)

    pinger_task = asyncio.create_task(pinger(), name="BOT-event-stream-pinger")

    # send "challenge" and "gameStart" events from event_queue to the BOT
    while bot_player.online:
        answer = await bot_player.event_queue.get()
        if answer is None:
            bot_player.event_queue.task_done()
        try:
            if request.transport is not None and request.transport.is_closing():
                break
            else:
                await resp.write(answer.encode())
                bot_player.event_queue.task_done()
        except Exception:
            log.error("Writing %s to BOT %s event_stream is broken...", answer, username)  # fmt: skip # noqa: F821
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT event_stream failed!")

    pinger_task.cancel()
    await bot_player.clear_seeks()
    return resp


@authorized
async def game_stream(request):
    gameId = request.match_info["gameId"]

    app_state = get_app_state(request.app)

    game = app_state.games[gameId]

    resp = web.StreamResponse()
    resp.content_type = "application/x-ndjson"
    await resp.prepare(request)

    bot_player = app_state.users[username]  # noqa: F821

    log.info("+++ %s connected to %s game stream", bot_player.username, gameId)

    await bot_player.game_queues[gameId].put(game.game_full)

    async def pinger():
        """To help lichess-bot.py abort games showing no activity."""
        while True:
            if gameId in bot_player.game_queues:
                await bot_player.game_queues[gameId].put('{"type":"ping"}\n')
                await asyncio.sleep(6)
            else:
                break

    pinger_task = asyncio.create_task(pinger(), name="BOT-game-stream-pinger")

    while True:
        answer = await bot_player.game_queues[gameId].get()
        if answer is None:
            bot_player.game_queues[gameId].task_done()
        try:
            if request.transport is not None and request.transport.is_closing():
                break
            else:
                await resp.write(answer.encode())
                bot_player.game_queues[gameId].task_done()
        except Exception:
            log.error("Writing %s to BOT %s game_stream failed!", answer, username)  # noqa: F821
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT game_stream failed!")
    pinger_task.cancel()

    return resp


@authorized
async def bot_move(request):
    gameId = request.match_info["gameId"]
    move = request.match_info["move"]

    app_state = get_app_state(request.app)

    user = app_state.users[username]  # noqa: F821
    game = app_state.games[gameId]

    await play_move(app_state, user, game, move)

    return web.json_response({"ok": True})


@authorized
async def bot_abort(request):
    app_state = get_app_state(request.app)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]

    bot_player = app_state.users[username]  # noqa: F821

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username  # fmt: skip # noqa: F821
    opp_player = app_state.users[opp_name]

    response = await game.abort_by_server()
    await bot_player.game_queues[gameId].put(game.game_end)
    if opp_player.bot:
        await opp_player.game_queues[gameId].put(game.game_end)
    else:
        await app_state.users[opp_name].send_game_message(gameId, response)

    await round_broadcast(game, response)

    return web.json_response({"ok": True})


@authorized
async def bot_resign(request):
    app_state = get_app_state(request.app)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]
    game.status = RESIGN
    game.result = "0-1" if username == game.wplayer.username else "1-0"  # noqa: F821
    return web.json_response({"ok": True})


@authorized
async def bot_chat(request):
    app_state = get_app_state(request.app)

    data = await request.post()
    print("BOT-CHAT", username, data)  # noqa: F821

    gameId = request.match_info["gameId"]

    game = app_state.games[gameId]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username  # fmt: skip  # noqa: F821

    if not app_state.users[opp_name].bot:
        await app_state.users[opp_name].send_game_message(
            gameId,
            {
                "type": "roundchat",
                "user": username,  # noqa: F821
                "room": data["room"],
                "message": data["text"],
            },
        )

    return web.json_response({"ok": True})
