from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta
from functools import partial

import aiohttp_session
from aiohttp import web
from aiohttp_sse import sse_response

from compress import get_decode_method, C2V, V2C, C2R, decode_move_standard
from const import GRANDS, STARTED, MATE, VARIANTS, INVALIDMOVE, VARIANTEND, CLAIM
from convert import zero2grand
from settings import ADMINS
from tournaments import get_tournament_name
from utils import pgn
from pychess_global_app_state_utils import get_app_state

log = logging.getLogger(__name__)

GAME_PAGE_SIZE = 12


async def variant_counts_aggregation(app_state, humans, query_period=None):
    pipeline = [
        {
            "$group": {
                "_id": {
                    "p": {"$dateToString": {"format": "%Y%m", "date": "$d"}},
                    "v": "$v",
                    "z": "$z",
                },
                "c": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    match_cond = {}

    if query_period is not None:
        year, month = int(query_period[:4]), int(query_period[4:])
        match_cond["$expr"] = {
            "$and": [
                {"$eq": [{"$month": "$d"}, month]},
                {"$eq": [{"$year": "$d"}, year]},
            ]
        }

    if humans:
        humans_cond = {"us": {"$not": {"$elemMatch": {"$in": ["Fairy-Stockfish", "Random-Mover"]}}}}
        if query_period is None:
            match_cond = humans_cond
        else:
            match_cond["$expr"]["$and"].append(humans_cond)

    if len(match_cond) > 0:
        pipeline.insert(0, {"$match": match_cond})

    cursor = app_state.db.game.aggregate(pipeline)

    docs = []

    async for doc in cursor:
        print(doc)
        if doc["_id"]["p"] < "201907":
            continue
        docs.append(doc)

    if docs:
        if humans:
            await app_state.db.stats_humans.insert_many(docs)
        else:
            await app_state.db.stats.insert_many(docs)

    return docs


def variant_counts_from_docs(variant_counts, docs):
    period = ""
    for doc in docs:
        print(doc)
        if doc["_id"]["p"] != period:
            period = doc["_id"]["p"]
            for variant in VARIANTS:
                variant_counts[variant].append(0)

        variant = C2V[doc["_id"]["v"]] + ("960" if doc["_id"].get("z", 0) else "")
        try:
            variant_counts[variant][-1] = doc["c"]
        except KeyError:
            log.error("Support of variant %s discontinued!", variant)


async def get_variant_stats(request):
    app_state = get_app_state(request.app)
    humans = "/humans" in request.path
    stats = app_state.stats_humans if humans else app_state.stats

    first_day_of_current_month = date.today().replace(day=1)
    last_day_of_previous_month = first_day_of_current_month - timedelta(days=1)

    cur_period = last_day_of_previous_month.isoformat()[:7].replace("-", "")
    print(cur_period)

    if cur_period in stats:
        series = stats[cur_period]
    else:
        variant_counts = {variant: [] for variant in VARIANTS}
        if humans:
            n = await app_state.db.stats_humans.count_documents({})
        else:
            n = await app_state.db.stats.count_documents({})

        if n > 0:
            # We already have some stats
            if humans:
                cursor = app_state.db.stats_humans.find()
            else:
                cursor = app_state.db.stats.find()

            docs = await cursor.to_list(n)
            variant_counts_from_docs(variant_counts, docs)

            doc = await app_state.db.stats.find_one({"_id": {"p": cur_period}})
            # If the last period is missing from the stats we call the aggregation
            if doc is None:
                docs = await variant_counts_aggregation(app_state, humans, cur_period)
                variant_counts_from_docs(variant_counts, docs)
        else:
            # Call the aggregation on the whole games collection
            docs = await variant_counts_aggregation(app_state, humans)
            variant_counts_from_docs(variant_counts, docs)

        series = [{"name": variant, "data": variant_counts[variant]} for variant in VARIANTS]

        stats[cur_period] = series

    return web.json_response(series, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_tournament_games(request):
    app_state = get_app_state(request.app)
    tournamentId = request.match_info.get("tournamentId")

    if tournamentId is not None and tournamentId not in app_state.tournaments:
        await asyncio.sleep(3)
        return web.json_response({})

    cursor = app_state.db.game.find({"tid": tournamentId})
    game_doc_list = []

    variant = app_state.tournaments[tournamentId].variant
    decode_method = get_decode_method(variant)

    async for doc in cursor:
        doc["v"] = C2V[doc["v"]]
        doc["r"] = C2R[doc["r"]]
        game_doc_list.append(
            {
                "id": doc["_id"],
                "variant": variant,
                "is960": doc.get("z", 0),
                "users": doc["us"],
                "result": doc["r"],
                "fen": doc.get("if"),
                "moves": [*map(decode_method, doc["m"])],
            }
        )

    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def get_user_games(request):
    app_state = get_app_state(request.app)
    profileId = request.match_info.get("profileId")

    if profileId is not None and profileId not in app_state.users:
        await asyncio.sleep(3)
        return web.json_response({})

    # Who made the request?
    session = await aiohttp_session.get_session(request)
    session_user = session.get("user_name")
    user = await app_state.users.get(session_user)
    if user.anon:
        await asyncio.sleep(3)
        return web.json_response({})

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
    elif "/playing" in request.path:
        filter_cond["$and"] = [
            {"$or": [{"c": True, "us.1": profileId}, {"c": True, "us.0": profileId}]},
            {"s": STARTED},
        ]
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

    if "/import" not in request.path:
        new_filter_cond = {
            "$and": [
                filter_cond,
                {"y": {"$ne": 2}},
            ]
        }
        filter_cond = new_filter_cond

    page_num = request.rel_url.query.get("p", 0)

    game_doc_list = []
    if profileId is not None:
        # print("FILTER:", filter_cond)
        cursor = app_state.db.game.find(filter_cond)
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

            try:
                doc["v"] = C2V[doc["v"]]
            except KeyError:
                log.error("Unknown variant %r", doc, exc_info=True)
                continue

            doc["r"] = C2R[doc["r"]]
            doc["wt"] = (
                app_state.users[doc["us"][0]].title if doc["us"][0] in app_state.users else ""
            )
            doc["bt"] = (
                app_state.users[doc["us"][1]].title if doc["us"][1] in app_state.users else ""
            )

            if len(doc["us"]) > 2:
                doc["wtB"] = (
                    app_state.users[doc["us"][2]].title if doc["us"][2] in app_state.users else ""
                )
                doc["btB"] = (
                    app_state.users[doc["us"][3]].title if doc["us"][3] in app_state.users else ""
                )

            if doc["v"] in ("bughouse", "bughouse960"):
                mA = [m for idx, m in enumerate(doc["m"]) if doc["o"][idx] == 0]
                mB = [m for idx, m in enumerate(doc["m"]) if doc["o"][idx] == 1]
                doc["lm"] = decode_move_standard(mA[-1]) if len(mA) > 0 else ""
                doc["lmB"] = decode_move_standard(mB[-1]) if len(mB) > 0 else ""
            else:
                variant = doc["v"]
                decode_method = get_decode_method(variant)

                doc["lm"] = decode_method(doc["m"][-1]) if len(doc["m"]) > 0 else ""
            if doc["v"] in GRANDS and doc["lm"] != "":
                doc["lm"] = zero2grand(doc["lm"])

            tournament_id = doc.get("tid")
            if tournament_id is not None:
                doc["tn"] = await get_tournament_name(request, tournament_id)

            if uci_moves:
                game_doc_list.append(
                    {
                        "id": doc["_id"],
                        "variant": doc["v"],
                        "is960": doc.get("z", 0),
                        "users": doc["us"],
                        "result": doc["r"],
                        "fen": doc.get("f"),
                        "moves": [*map(decode_method, doc["m"])],
                    }
                )
            else:
                game_doc_list.append(doc)

    return web.json_response(game_doc_list, dumps=partial(json.dumps, default=datetime.isoformat))


async def cancel_invite(request):
    app_state = get_app_state(request.app)
    gameId = request.match_info.get("gameId")

    if gameId in app_state.invites:
        seek_id = app_state.invites[gameId].id
        seek = app_state.seeks[seek_id]
        creator = seek.creator
        try:
            del app_state.invites[gameId]
            del app_state.seeks[seek_id]
            del creator.seeks[seek_id]
        except KeyError:
            log.error("Seek was already deleted!", exc_info=True)

    return web.HTTPFound("/")


async def subscribe_invites(request):
    app_state = get_app_state(request.app)
    try:
        async with sse_response(request) as response:
            queue = asyncio.Queue()
            app_state.invite_channels.add(queue)
            while response.is_connected():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
    except ConnectionResetError as e:
        log.error(e, exc_info=True)
    finally:
        app_state.invite_channels.remove(queue)
    return response


async def subscribe_games(request):
    app_state = get_app_state(request.app)
    queue = asyncio.Queue()
    app_state.game_channels.add(queue)
    try:
        async with sse_response(request) as response:
            while response.is_connected():
                payload = await queue.get()
                await response.send(payload)
                queue.task_done()
    except (ConnectionResetError, asyncio.CancelledError) as e:
        log.error(e, exc_info=True)
    finally:
        app_state.game_channels.remove(queue)
    return response


def get_games(request):
    app_state = get_app_state(request.app)
    games = app_state.games.values()
    variant = request.match_info.get("variant")
    chess960 = variant.endswith("960") if variant else False
    if chess960:
        variant = variant[:-3]
    return web.json_response(
        [
            {
                "gameId": game.id,
                "variant": game.variant,
                "fen": game.board.fen,
                "lastMove": game.lastmove,
                "tp": game.turn_player,
                "w": game.wplayer.username,
                "wTitle": game.wplayer.title,
                "b": game.bplayer.username,
                "bTitle": game.bplayer.title,
                "chess960": game.chess960,
                "base": game.base,
                "inc": game.inc,
                "byoyomi": game.byoyomi_period,
                "level": game.level,
                "day": game.base if game.corr else 0,
            }
            for game in games
            if game.status == STARTED
            and ((game.variant == variant and game.chess960 == chess960) if variant else True)
        ][-20:]
    )


async def export(request):
    app_state = get_app_state(request.app)
    profileId = request.match_info.get("profileId")
    if profileId is not None and profileId not in app_state.users:
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
        cursor = app_state.db.game.find({"us": profileId})
    elif tournamentId is not None:
        cursor = app_state.db.game.find({"tid": tournamentId})
    elif session_user in ADMINS:
        yearmonth = request.match_info.get("yearmonth")
        print("---", yearmonth[:4], yearmonth[4:])
        filter_cond = {
            "$and": [
                {"$expr": {"$eq": [{"$year": "$d"}, int(yearmonth[:4])]}},
                {"$expr": {"$eq": [{"$month": "$d"}, int(yearmonth[4:])]}},
            ]
        }
        cursor = app_state.db.game.find(filter_cond)

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
                    exc_info=True,
                )
                continue
        print("failed/all:", failed, game_counter)
    pgn_text = "\n".join(game_list)
    return web.Response(text=pgn_text, content_type="text/pgn")
