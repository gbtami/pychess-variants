import asyncio
import json
import logging
from datetime import datetime
from functools import partial

from aiohttp import web
import aiohttp_session
from aiohttp_sse import sse_response

from const import STARTED, MATE, VARIANTS, INVALIDMOVE, VARIANTEND, CLAIM
from compress import C2V, V2C, C2R
from utils import pgn

log = logging.getLogger(__name__)

GAME_PAGE_SIZE = 12


async def get_user_games(request):
    users = request.app["users"]
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    filter_cond = {}
    # print("URL", request.rel_url)
    level = request.rel_url.query.get("x")
    variant = request.path[request.path.rfind("/") + 1:]

    if "/win" in request.path:
        filter_cond["$or"] = [{"r": "a", "us.0": profileId}, {"r": "b", "us.1": profileId}]
    elif "/loss" in request.path:
        # level8win requests Fairy-Stockfish lost games
        if level is not None:
            filter_cond["$and"] = [
                {"$or": [{"r": "a", "us.1": profileId}, {"r": "b", "us.0": profileId}]},
                {"x": int(level)},
                {"$or": [{"if": None}, {"v": "j"}]},  # Janggi games always have initial FEN!
                {"$or": [{"s": MATE}, {"s": VARIANTEND}, {"s": INVALIDMOVE}, {"s": CLAIM}]},
            ]
        else:
            filter_cond["$or"] = [{"r": "a", "us.1": profileId}, {"r": "b", "us.0": profileId}]
    elif variant in VARIANTS:
        if variant.endswith("960"):
            v = V2C[variant[:-3]]
            z = 1
        else:
            v = V2C[variant]
            z = 0
        filter_cond["$or"] = [{"v": v, "z": z, "us.1": profileId}, {"v": v, "z": z, "us.0": profileId}]
    else:
        filter_cond["us"] = profileId

    page_num = request.rel_url.query.get("p")
    if not page_num:
        page_num = 0

    game_doc_list = []
    if profileId is not None:
        # print("FILTER:", filter_cond)
        cursor = db.game.find(filter_cond)
        cursor.sort('d', -1).skip(int(page_num) * GAME_PAGE_SIZE).limit(GAME_PAGE_SIZE)
        async for doc in cursor:
            # filter out private games
            if "p" in doc and doc["p"] == 1 and session_user != doc["us"][0] and session_user != doc["us"][1]:
                continue

            doc["v"] = C2V[doc["v"]]
            doc["r"] = C2R[doc["r"]]
            doc["wt"] = users[doc["us"][0]].title if doc["us"][0] in users else ""
            doc["bt"] = users[doc["us"][1]].title if doc["us"][1] in users else ""
            game_doc_list.append(doc)
    # print("GAMES:", game_doc_list)
    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def subscribe_games(request):
    async with sse_response(request) as response:
        app = request.app
        queue = asyncio.Queue()
        app['channels'].add(queue)
        try:
            while not response.task.done():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
        finally:
            app['channels'].remove(queue)
    return response


async def subscribe_notify(request):
    async with sse_response(request) as response:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")

        user = request.app["users"].get(session_user)
        if user is None:
            return response

        user.notify_queue = asyncio.Queue()
        try:
            while not response.task.done():
                payload = await user.notify_queue.get()
                await response.send(payload)
                user.notify_queue.task_done()
        finally:
            user.notify_queue = None
    return response


async def get_games(request):
    games = request.app["games"]
    # TODO: filter last 10 by variant
    return web.json_response([
        {"gameId": game.id, "variant": game.variant, "fen": game.board.fen, "w": game.wplayer.username, "b": game.bplayer.username}
        for game in games.values() if game.status == STARTED][-20:])


async def export(request):
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    game_list = []
    game_counter = 0
    failed = 0
    if profileId is not None:
        if profileId == "all_games" and session_user in request.app["fishnet_versions"]:
            cursor = db.game.find()
        else:
            cursor = db.game.find({"us": profileId})

        async for doc in cursor:
            try:
                # print(game_counter)
                # log.info("%s %s %s" % (doc["d"].strftime("%Y.%m.%d"), doc["_id"], C2V[doc["v"]]))
                pgn_text = pgn(doc)
                if pgn_text is not None:
                    game_list.append(pgn_text)
                game_counter += 1
            except Exception:
                failed += 1
                log.error("Failed to load game %s %s %s (early games may contain invalid moves)" % (doc["_id"], C2V[doc["v"]], doc["d"].strftime("%Y.%m.%d")))
                continue
        print('failed/all:', failed, game_counter)
    pgn_text = "\n".join(game_list)
    return web.Response(text=pgn_text, content_type="text/pgn")
