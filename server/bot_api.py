from __future__ import annotations
import asyncio
import json
import logging

from aiohttp import web

from broadcast import round_broadcast
from const import STARTED, RESIGN
from seek import challenge, Seek
from settings import BOT_TOKENS
from user import User
from utils import join_seek, play_move
from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)


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

        await func(request)

    return inner


@authorized
async def bot_pong(request):
    return web.json_response({"ok": True})


@authorized
async def account(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]
    return web.json_response({"username": username, "title": "BOT"})


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
async def create_bot_seek(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    data = await request.post()

    app_state = get_app_state(request.app)

    bot_player = app_state.users[username]

    log.info("+++ %s created %s seek", bot_player.username, data["variant"])

    # Try to create BOT vs BOT game to test TV
    test_TV = True
    matching_seek = None
    if test_TV:
        for seek in app_state.seeks.values():
            if (
                seek.variant == data["variant"]
                and seek.creator.bot
                and seek.creator.online
                and seek.creator.username != username
                and seek.level > 0
            ):
                log.debug("MATCHING BOT SEEK %s FOUND!", seek.id)
                matching_seek = seek
                break

    if matching_seek is None:
        seek = None
        for existing_seek in app_state.seeks.values():
            if existing_seek.creator == bot_player and existing_seek.variant == data["variant"]:
                seek = existing_seek
                break
        if seek is None:
            seek = Seek(bot_player, data["variant"], player1=bot_player)
            app_state.seeks[seek.id] = seek
        bot_player.seeks[seek.id] = seek

        # inform others
        await app_state.lobby.lobby_broadcast_seeks()
    else:
        response = await join_seek(app_state, bot_player, matching_seek.id)

        gameId = response["gameId"]
        game = app_state.games[gameId]

        chall = challenge(seek, gameId)

        await seek.creator.event_queue.put(chall)
        seek.creator.game_queues[gameId] = asyncio.Queue()

        await bot_player.event_queue.put(chall)
        bot_player.game_queues[gameId] = asyncio.Queue()

        await seek.creator.event_queue.put(game.game_start)
        await bot_player.event_queue.put(game.game_start)

    return web.json_response({"ok": True})


@authorized
async def event_stream(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    app_state = get_app_state(request.app)

    resp = web.StreamResponse()
    resp.content_type = "text/plain"
    await resp.prepare(request)

    if username in app_state.users:
        bot_player = app_state.users[username]
        # After BOT lost connection it may have ongoing games
        # We notify BOT and he can ask to create new game_streams
        # to continue those games
        for gameId in bot_player.game_queues:
            if gameId in app_state.games and app_state.games[gameId].status == STARTED:
                await bot_player.event_queue.put(app_state.games[gameId].game_start)
    else:
        bot_player = User(app_state, bot=True, username=username)
        app_state.users[bot_player.username] = bot_player

        doc = await app_state.db.user.find_one({"_id": username})
        if doc is None:
            result = await app_state.db.user.insert_one(
                {
                    "_id": username,
                    "title": "BOT",
                }
            )
            print("db insert user result %s" % repr(result.inserted_id))

    bot_player.online = True

    log.info("+++ BOT %s connected", bot_player.username)

    pinger_task = asyncio.create_task(
        bot_player.pinger(app_state.sockets, app_state.seeks, app_state.users, app_state.games)
    )

    # inform others
    # TODO: do we need this at all?
    await app_state.lobby.lobby_broadcast_seeks()

    # send "challenge" and "gameStart" events from event_queue to the BOT
    while bot_player.online:
        answer = await bot_player.event_queue.get()
        try:
            bot_player.event_queue.task_done()
        except ValueError:
            log.error(
                "task_done() called more times than there were items placed in the queue in bot_api.py event_stream()"
            )
        try:
            if request.protocol.transport.is_closing():
                log.error(
                    "BOT %s request.protocol.transport.is_closing() == True ...",
                    username,
                )
                break
            else:
                await resp.write(answer.encode("utf-8"))
                await resp.drain()
        except Exception:
            log.error("BOT %s event_stream is broken...", username, exc_info=True)
            break

    pinger_task.cancel()
    await bot_player.clear_seeks(force=True)
    return resp


@authorized
async def game_stream(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    gameId = request.match_info["gameId"]

    app_state = get_app_state(request.app)

    game = app_state.games[gameId]

    resp = web.StreamResponse()
    resp.content_type = "application/json"
    await resp.prepare(request)

    bot_player = app_state.users[username]

    log.info("+++ %s connected to %s game stream", bot_player.username, gameId)

    await bot_player.game_queues[gameId].put(game.game_full)

    async def pinger():
        """To help lichess-bot.py abort games showing no activity."""
        while True:
            if gameId in bot_player.game_queues:
                await bot_player.game_queues[gameId].put("\n")
                await asyncio.sleep(5)
            else:
                break

    pinger_task = asyncio.create_task(pinger())

    while True:
        answer = await bot_player.game_queues[gameId].get()
        try:
            bot_player.game_queues[gameId].task_done()
        except ValueError:
            log.error(
                "task_done() called more times than there were items placed in the queue in bot_api.py game_stream()"
            )
        try:
            await resp.write(answer.encode("utf-8"))
            await resp.drain()
        except Exception:
            log.error("Writing %s to BOT game_stream failed!", answer, exc_info=True)
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT game_stream failed!", exc_info=True)
    pinger_task.cancel()

    return resp


@authorized
async def bot_move(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]
    gameId = request.match_info["gameId"]
    move = request.match_info["move"]

    app_state = get_app_state(request.app)

    user = app_state.users[username]
    game = app_state.games[gameId]

    await play_move(app_state, user, game, move)

    return web.json_response({"ok": True})


@authorized
async def bot_abort(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    app_state = get_app_state(request.app)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]

    bot_player = app_state.users[username]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username
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
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    app_state = get_app_state(request.app)

    gameId = request.match_info["gameId"]
    game = app_state.games[gameId]
    game.status = RESIGN
    game.result = "0-1" if username == game.wplayer.username else "1-0"
    return web.json_response({"ok": True})


@authorized
async def bot_analysis(request):
    user_agent = request.headers.get("User-Agent")
    bot_name = user_agent[user_agent.find("user:") + 5 :]

    app_state = get_app_state(request.app)

    data = await request.post()

    gameId = request.match_info["gameId"]

    username = data["username"]

    if app_state.users[username].is_user_active_in_game(gameId):
        game = app_state.games[gameId]

        ply = data["ply"]
        ceval = json.loads(data["ceval"])
        print(ply, ceval)
        if "score" in ceval:
            game.steps[int(ply)]["eval"] = ceval["score"]

        response = {
            "type": "roundchat",
            "user": bot_name,
            "room": "spectator",
            "message": ply + " " + json.dumps(ceval),
        }
        await app_state.users[username].send_game_message(gameId, response)

        response = {
            "type": "analysis",
            "ply": ply,
            "color": data["color"],
            "ceval": ceval,
        }
        await app_state.users[username].send_game_message(gameId, response)

    return web.json_response({"ok": True})


@authorized
async def bot_chat(request):
    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5 :]

    app_state = get_app_state(request.app)

    data = await request.post()

    gameId = request.match_info["gameId"]

    game = app_state.games[gameId]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username

    if not app_state.users[opp_name].bot:
        await app_state.users[opp_name].send_game_message(
            gameId,
            {
                "type": "roundchat",
                "user": username,
                "room": data["room"],
                "message": data["text"],
            },
        )

    return web.json_response({"ok": True})
