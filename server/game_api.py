import asyncio
import json
import logging
from datetime import datetime
from functools import partial

from aiohttp import web
import aiohttp_session
from aiohttp_sse import sse_response

from const import GRANDS, STARTED, MATE, VARIANTS, INVALIDMOVE, VARIANTEND, CLAIM
from compress import decode_moves, C2V, V2C, C2R
from convert import zero2grand
from utils import pgn
from settings import ADMINS
from tournaments import get_tournament_name

log = logging.getLogger(__name__)

GAME_PAGE_SIZE = 12


async def get_variant_stats(request):
    cur_period = datetime.now().isoformat()[:7]

    if "/humans" in request.path:
        stats = "stats_humans"
    else:
        stats = "stats"

    if cur_period in request.app[stats]:
        series = request.app[stats][cur_period]
    else:
        db = request.app["db"]

        pipeline = [
            {
                "$group": {
                    "_id": {
                        "period": {"$dateToString": {"format": "%Y-%m", "date": "$d"}},
                        "v": "$v",
                        "960": "$z",
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        if "/humans" in request.path:
            pipeline.insert(
                0,
                {
                    "$match": {
                        "us": {"$not": {"$elemMatch": {"$in": ["Fairy-Stockfish", "Random-Mover"]}}}
                    }
                },
            )
        cursor = db.game.aggregate(pipeline)

        variant_counts = {variant: [] for variant in VARIANTS}

        period = ""
        async for doc in cursor:
            # print(doc)
            if doc["_id"]["period"] < "2019-07":
                continue
            if doc["_id"]["period"] != period:
                period = doc["_id"]["period"]
                # skip current period
                if period == cur_period:
                    break

                for variant in VARIANTS:
                    variant_counts[variant].append(0)

            is_960 = doc["_id"].get("960", False)
            variant = C2V[doc["_id"]["v"]] + ("960" if is_960 else "")
            cnt = doc["count"]
            try:
                variant_counts[variant][-1] = cnt
            except KeyError:
                # support of variant discontinued
                pass

        series = [{"name": variant, "data": variant_counts[variant]} for variant in VARIANTS]

        request.app[stats][cur_period] = series

    return web.json_response(series, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_tournament_games(request):
    tournaments = request.app["tournaments"]
    db = request.app["db"]
    tournamentId = request.match_info.get("tournamentId")

    if tournamentId is not None and tournamentId not in tournaments:
        await asyncio.sleep(3)
        return web.json_response({})

    cursor = db.game.find({"tid": tournamentId})
    game_doc_list = []

    async for doc in cursor:
        doc["v"] = C2V[doc["v"]]
        doc["r"] = C2R[doc["r"]]
        game_doc_list.append(
            {
                "id": doc["_id"],
                "variant": doc["v"],
                "is960": doc.get("z", 0),
                "users": doc["us"],
                "result": doc["r"],
                "fen": doc.get("if"),
                "moves": decode_moves(doc["m"], doc["v"]),
            }
        )

    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_user_games(request):
    users = request.app["users"]
    db = request.app["db"]
    profileId = request.match_info.get("profileId")

    if profileId is not None and profileId not in users:
        await asyncio.sleep(3)
        return web.json_response({})

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    filter_cond = {}
    # print("URL", request.rel_url)
    level = request.rel_url.query.get("x")
    variant = request.path[request.path.rfind("/") + 1 :]

    # produce UCI move list for puzzle generator
    uci_moves = "/json" in request.path

    if "/win" in request.path:
        filter_cond["$or"] = [
            {"r": "a", "us.0": profileId},
            {"r": "b", "us.1": profileId},
        ]
    elif "/loss" in request.path:
        # level8win requests Fairy-Stockfish lost games
        if level is not None:
            filter_cond["$and"] = [
                {"$or": [{"r": "a", "us.1": profileId}, {"r": "b", "us.0": profileId}]},
                {"x": int(level)},
                {"$or": [{"if": None}, {"v": "j"}]},  # Janggi games always have initial FEN!
                {
                    "$or": [
                        {"s": MATE},
                        {"s": VARIANTEND},
                        {"s": INVALIDMOVE},
                        {"s": CLAIM},
                    ]
                },
            ]
        else:
            filter_cond["$or"] = [
                {"r": "a", "us.1": profileId},
                {"r": "b", "us.0": profileId},
            ]
    elif "/rated" in request.path:
        filter_cond["$or"] = [{"y": 1, "us.1": profileId}, {"y": 1, "us.0": profileId}]
    elif "/import" in request.path:
        filter_cond["by"] = profileId
        filter_cond["y"] = 2
    elif ("/perf" in request.path or uci_moves) and variant in VARIANTS:
        if variant.endswith("960"):
            v = V2C[variant[:-3]]
            z = 1
        else:
            v = V2C[variant]
            z = 0
        filter_cond["$or"] = [
            {"v": v, "z": z, "us.1": profileId},
            {"v": v, "z": z, "us.0": profileId},
        ]
    elif "/me" in request.path:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        filter_cond["$or"] = [
            {"us.0": session_user, "us.1": profileId},
            {"us.1": session_user, "us.0": profileId},
        ]
    else:
        filter_cond["us"] = profileId

    page_num = request.rel_url.query.get("p")
    if not page_num:
        page_num = 0

    game_doc_list = []
    if profileId is not None:
        # print("FILTER:", filter_cond)
        cursor = db.game.find(filter_cond)
        if uci_moves:
            cursor.sort("d", -1)
        else:
            cursor.sort("d", -1).skip(int(page_num) * GAME_PAGE_SIZE).limit(GAME_PAGE_SIZE)
        async for doc in cursor:
            # filter out private games
            if (
                "p" in doc
                and doc["p"] == 1
                and session_user != doc["us"][0]
                and session_user != doc["us"][1]
            ):
                continue

            doc["v"] = C2V[doc["v"]]
            doc["r"] = C2R[doc["r"]]
            doc["wt"] = users[doc["us"][0]].title if doc["us"][0] in users else ""
            doc["bt"] = users[doc["us"][1]].title if doc["us"][1] in users else ""
            doc["lm"] = decode_moves((doc["m"][-1],), doc["v"])[-1] if len(doc["m"]) > 0 else ""
            if doc["v"] in GRANDS and doc["lm"] != "":
                doc["lm"] = zero2grand(doc["lm"])

            tournament_id = doc.get("tid")
            if tournament_id is not None:
                doc["tn"] = await get_tournament_name(request.app, tournament_id)

            if uci_moves:
                game_doc_list.append(
                    {
                        "id": doc["_id"],
                        "variant": doc["v"],
                        "is960": doc.get("z", 0),
                        "users": doc["us"],
                        "result": doc["r"],
                        "fen": doc.get("if"),
                        "moves": decode_moves(doc["m"], doc["v"]),
                    }
                )
            else:
                game_doc_list.append(doc)

    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def cancel_invite(request):
    gameId = request.match_info.get("gameId")
    seeks = request.app["seeks"]
    invites = request.app["invites"]

    if gameId in invites:
        seek_id = invites[gameId].id
        seek = seeks[seek_id]
        creator = seek.creator
        try:
            del invites[gameId]
            del seeks[seek_id]
            del creator.seeks[seek_id]
        except KeyError:
            # Seek was already deleted
            pass

    return web.HTTPFound("/")


async def subscribe_invites(request):
    async with sse_response(request) as response:
        app = request.app
        queue = asyncio.Queue()
        app["invite_channels"].add(queue)
        try:
            while not response.task.done():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
        except ConnectionResetError:
            pass
        finally:
            app["invite_channels"].remove(queue)
    return response


async def subscribe_games(request):
    async with sse_response(request) as response:
        app = request.app
        queue = asyncio.Queue()
        app["game_channels"].add(queue)
        try:
            while not response.task.done():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
        except ConnectionResetError:
            pass
        finally:
            app["game_channels"].remove(queue)
    return response


async def get_games(request):
    games = request.app["games"]
    # TODO: filter last 10 by variant
    return web.json_response(
        [
            {
                "gameId": game.id,
                "variant": game.variant,
                "fen": game.board.fen,
                "w": game.wplayer.username,
                "b": game.bplayer.username,
                "chess960": game.chess960,
                "base": game.base,
                "inc": game.inc,
                "byoyomi": game.byoyomi_period,
            }
            for game in games.values()
            if game.status == STARTED
        ][-20:]
    )


async def export(request):
    db = request.app["db"]
    users = request.app["users"]
    profileId = request.match_info.get("profileId")
    if profileId is not None and profileId not in users:
        await asyncio.sleep(3)
        return web.Response(text="")

    tournamentId = request.match_info.get("tournamentId")
    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")

    game_list = []
    game_counter = 0
    failed = 0
    cursor = None

    if profileId is not None:
        cursor = db.game.find({"us": profileId})
    elif tournamentId is not None:
        cursor = db.game.find({"tid": tournamentId})
    elif session_user in ADMINS:
        yearmonth = request.match_info.get("yearmonth")
        print("---", yearmonth[:4], yearmonth[4:])
        filter_cond = {
            "$and": [
                {"$expr": {"$eq": [{"$year": "$d"}, int(yearmonth[:4])]}},
                {"$expr": {"$eq": [{"$month": "$d"}, int(yearmonth[4:])]}},
            ]
        }
        cursor = db.game.find(filter_cond)

    if cursor is not None:
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
                log.error(
                    "Failed to load game %s %s %s (early games may contain invalid moves)",
                    doc["_id"],
                    C2V[doc["v"]],
                    doc["d"].strftime("%Y.%m.%d"),
                )
                continue
        print("failed/all:", failed, game_counter)
    pgn_text = "\n".join(game_list)
    return web.Response(text=pgn_text, content_type="text/pgn")
