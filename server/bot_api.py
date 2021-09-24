import asyncio
import json
import logging

from aiohttp import web

from const import STARTED, RESIGN
from broadcast import round_broadcast, lobby_broadcast
from user import User
from seek import challenge, get_seeks, Seek
from utils import join_seek, play_move
from settings import BOT_TOKENS

log = logging.getLogger(__name__)


async def account(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    resp = {"username": BOT_TOKENS[token], "title": "BOT"}
    log.info("ACCOUNT for token %s for %s is OK", token, BOT_TOKENS[token])
    return web.json_response(resp)


async def playing(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    resp = {"nowPlaying": []}
    return web.json_response(resp)


async def challenge_create(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    return web.json_response({"ok": True})


async def challenge_accept(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    return web.json_response({"ok": True})


async def challenge_decline(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    return web.json_response({"ok": True})


async def create_bot_seek(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    data = await request.post()

    users = request.app["users"]
    seeks = request.app["seeks"]
    sockets = request.app["lobbysockets"]

    bot_player = users[username]

    log.info("+++ %s created %s seek", bot_player.username, data["variant"])

    # Try to create BOT vs BOT game to test TV
    test_TV = True
    matching_seek = None
    if test_TV:
        for seek in seeks.values():
            if seek.variant == data["variant"] and seek.creator.bot and seek.creator.online and seek.creator.username != username and seek.level > 0:
                log.debug("MATCHING BOT SEEK %s FOUND!", seek.id)
                matching_seek = seek
                break

    if matching_seek is None:
        seek = None
        for existing_seek in seeks.values():
            if existing_seek.creator == bot_player and existing_seek.variant == data["variant"]:
                seek = existing_seek
                break
        if seek is None:
            seek = Seek(bot_player, data["variant"], player1=bot_player)
            seeks[seek.id] = seek
        bot_player.seeks[seek.id] = seek

        # inform others
        await lobby_broadcast(sockets, get_seeks(seeks))
    else:
        games = request.app["games"]
        response = await join_seek(request.app, bot_player, matching_seek.id)

        gameId = response["gameId"]
        game = games[gameId]

        chall = challenge(seek, gameId)

        await seek.creator.event_queue.put(chall)
        seek.creator.game_queues[gameId] = asyncio.Queue()

        await bot_player.event_queue.put(chall)
        bot_player.game_queues[gameId] = asyncio.Queue()

        await seek.creator.event_queue.put(game.game_start)
        await bot_player.event_queue.put(game.game_start)

    return web.json_response({"ok": True})


async def event_stream(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    users = request.app["users"]
    seeks = request.app["seeks"]
    sockets = request.app["lobbysockets"]
    games = request.app["games"]
    db = request.app["db"]

    resp = web.StreamResponse()
    resp.content_type = "text/plain"
    await resp.prepare(request)

    if username in users:
        bot_player = users[username]
        # After BOT lost connection it may have ongoing games
        # We notify BOT and he can ask to create new game_streams
        # to continue those games
        for gameId in bot_player.game_queues:
            if gameId in games and games[gameId].status == STARTED:
                await bot_player.event_queue.put(games[gameId].game_start)
    else:
        bot_player = User(request.app, bot=True, username=username)
        users[bot_player.username] = bot_player

        doc = await db.user.find_one({"_id": username})
        if doc is None:
            result = await db.user.insert_one({
                "_id": username,
                "title": "BOT",
            })
            print("db insert user result %s" % repr(result.inserted_id))

    bot_player.online = True

    log.info("+++ BOT %s connected", bot_player.username)

    pinger_task = asyncio.create_task(bot_player.pinger(sockets, seeks, users, games))

    # inform others
    # TODO: do we need this at all?
    await lobby_broadcast(sockets, get_seeks(seeks))

    # send "challenge" and "gameStart" events from event_queue to the BOT
    while bot_player.online:
        answer = await bot_player.event_queue.get()
        try:
            bot_player.event_queue.task_done()
        except ValueError:
            log.error("task_done() called more times than there were items placed in the queue in bot_api.py event_stream()")
        try:
            if request.protocol.transport.is_closing():
                log.error("BOT %s request.protocol.transport.is_closing() == True ...", username)
                break
            else:
                await resp.write(answer.encode("utf-8"))
                await resp.drain()
        except Exception:
            log.error("BOT %s event_stream is broken...", username)
            break

    pinger_task.cancel()
    await bot_player.clear_seeks(sockets, seeks)
    return resp


async def game_stream(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    gameId = request.match_info["gameId"]

    users = request.app["users"]
    games = request.app["games"]

    game = games[gameId]

    resp = web.StreamResponse()
    resp.content_type = "application/json"
    await resp.prepare(request)

    bot_player = users[username]

    log.info("+++ %s connected to %s game stream", bot_player.username, gameId)

    await bot_player.game_queues[gameId].put(game.game_full)

    async def pinger():
        """ To help lichess-bot.py abort games showing no activity. """
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
            log.error("task_done() called more times than there were items placed in the queue in bot_api.py game_stream()")
        try:
            await resp.write(answer.encode("utf-8"))
            await resp.drain()
        except Exception:
            log.error("Writing %s to BOT game_stream failed!", answer)
            break

    try:
        await resp.write_eof()
    except Exception:
        log.error("Writing EOF to BOT game_stream failed!")
    pinger_task.cancel()

    return resp


async def bot_move(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]
    gameId = request.match_info["gameId"]
    move = request.match_info["move"]

    user = request.app["users"][username]
    game = request.app["games"][gameId]

    await play_move(request.app, user, game, move)

    return web.json_response({"ok": True})


async def bot_abort(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    games = request.app["games"]
    gameId = request.match_info["gameId"]
    game = games[gameId]

    users = request.app["users"]
    bot_player = users[username]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username
    opp_player = users[opp_name]

    response = await game.abort()
    await bot_player.game_queues[gameId].put(game.game_end)
    if opp_player.bot:
        await opp_player.game_queues[gameId].put(game.game_end)
    else:
        opp_ws = users[opp_name].game_sockets[gameId]
        await opp_ws.send_json(response)

    await round_broadcast(game, users, response)

    return web.json_response({"ok": True})


async def bot_resign(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    games = request.app["games"]
    gameId = request.match_info["gameId"]
    game = games[gameId]
    game.status = RESIGN
    game.result = "0-1" if username == game.wplayer.username else "1-0"
    return web.json_response({"ok": True})


async def bot_analysis(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    bot_name = user_agent[user_agent.find("user:") + 5:]

    data = await request.post()

    gameId = request.match_info["gameId"]

    users = request.app["users"]
    username = data["username"]

    if gameId in users[username].game_sockets:
        games = request.app["games"]
        game = games[gameId]

        ply = data["ply"]
        ceval = json.loads(data["ceval"])
        print(ply, ceval)
        if "score" in ceval:
            game.steps[int(ply)]["eval"] = ceval["score"]

        user_ws = users[username].game_sockets[gameId]
        response = {"type": "roundchat", "user": bot_name, "room": "spectator", "message": ply + " " + json.dumps(ceval)}
        await user_ws.send_json(response)

        response = {"type": "analysis", "ply": ply, "color": data["color"], "ceval": ceval}
        await user_ws.send_json(response)

    return web.json_response({"ok": True})


async def bot_chat(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    user_agent = request.headers.get("User-Agent")
    username = user_agent[user_agent.find("user:") + 5:]

    data = await request.post()

    gameId = request.match_info["gameId"]

    users = request.app["users"]
    games = request.app["games"]

    game = games[gameId]

    opp_name = game.wplayer.username if username == game.bplayer.username else game.bplayer.username

    if not users[opp_name].bot:
        opp_ws = users[opp_name].game_sockets[gameId]
        response = {"type": "roundchat", "user": username, "room": data["room"], "message": data["text"]}
        await opp_ws.send_json(response)

    return web.json_response({"ok": True})


async def bot_pong(request):
    auth = request.headers.get("Authorization")
    if auth is None:
        return web.HTTPForbidden()

    token = auth[auth.find("Bearer") + 7:]
    if token not in BOT_TOKENS:
        log.error("BOT account auth with token %s failed", token)
        return web.HTTPForbidden()

    return web.json_response({"ok": True})
