from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta
from functools import partial

import aiohttp_session
from aiohttp import web
from aiohttp_sse import sse_response
import pymongo

from compress import C2R, decode_move_standard
from const import DARK_FEN, STARTED, MATE, INVALIDMOVE, VARIANTEND, CLAIM, SSE_GET_TIMEOUT
from convert import zero2grand
from settings import ADMINS
from tournament.tournaments import get_tournament_name
from utils import pgn
from pychess_global_app_state_utils import get_app_state
from logger import log
from variants import C2V, GRANDS, get_server_variant, VARIANTS

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
        match_cond["$and"] = [
            {"us.0": {"$nin": ["Fairy-Stockfish", "Random-Mover"]}},
            {"us.1": {"$nin": ["Fairy-Stockfish", "Random-Mover"]}},
        ]

    if len(match_cond) > 0:
        pipeline.insert(0, {"$match": match_cond})

    cursor = await app_state.db.game.aggregate(pipeline)

    docs = []

    cur_period = datetime.now().isoformat()[:7].replace("-", "")

    async for doc in cursor:
        # print(doc)
        period = doc["_id"]["p"]
        if period < "201907":
            continue
        # skip current period
        if period == cur_period:
            break

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
        # print(doc)
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
    # print(cur_period)

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
            cursor.sort("_id", pymongo.ASCENDING)
            docs = await cursor.to_list(n)
            variant_counts_from_docs(variant_counts, docs)

            # If cur_period is missing from the stats we call the aggregation
            if docs[-1]["_id"]["p"] != cur_period:
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

    tournament = app_state.tournaments[tournamentId]
    variant = tournament.variant
    decode_method = tournament.server_variant.move_decoding

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

    path_parts = request.path.split("/")

    # produce UCI move list for puzzle generator
    uci_moves = "json" in path_parts

    if "win" in path_parts:
        filter_cond["$or"] = [
            {"r": "a", "us.0": profileId},
            {"r": "b", "us.1": profileId},
        ]
    elif "loss" in path_parts:
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
    elif "rated" in path_parts:
        filter_cond["$or"] = [{"y": 1, "us.1": profileId}, {"y": 1, "us.0": profileId}]
    elif "playing" in path_parts:
        filter_cond["$and"] = [
            {"$or": [{"c": True, "us.1": profileId}, {"c": True, "us.0": profileId}]},
            {"s": STARTED},
        ]
    elif "import" in path_parts:
        filter_cond["by"] = profileId
        filter_cond["y"] = 2
    elif ("perf" in path_parts or uci_moves) and variant in VARIANTS:
        variant960 = variant.endswith("960")
        uci_variant = variant[:-3] if variant960 else variant

        v = get_server_variant(uci_variant, variant960)
        z = 1 if variant960 else 0

        filter_cond["$or"] = [
            {"v": v.code, "z": z, "us.1": profileId},
            {"v": v.code, "z": z, "us.0": profileId},
        ]
    elif "me" in path_parts:
        session = await aiohttp_session.get_session(request)
        session_user = session.get("user_name")
        filter_cond["$or"] = [
            {"us.0": session_user, "us.1": profileId},
            {"us.1": session_user, "us.0": profileId},
        ]
    else:
        filter_cond["us"] = profileId

    if "import" not in path_parts:
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
                variant = C2V[doc["v"]]
                doc["v"] = variant
            except KeyError:
                log.error("get_user_games() KeyError. Unknown variant %r", doc["v"])
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

            server_variant = get_server_variant(variant, bool(doc.get("z", 0)))
            if server_variant.two_boards:
                mA = [m for idx, m in enumerate(doc["m"]) if "o" in doc and doc["o"][idx] == 0]
                mB = [m for idx, m in enumerate(doc["m"]) if "o" in doc and doc["o"][idx] == 1]
                doc["lm"] = decode_move_standard(mA[-1]) if len(mA) > 0 else ""
                doc["lmB"] = decode_move_standard(mB[-1]) if len(mB) > 0 else ""
            else:
                decode_method = server_variant.move_decoding
                doc["lm"] = decode_method(doc["m"][-1]) if len(doc["m"]) > 0 else ""

            if variant in GRANDS and doc["lm"] != "":
                doc["lm"] = zero2grand(doc["lm"])

            tournament_id = doc.get("tid")
            if tournament_id is not None:
                doc["tn"] = await get_tournament_name(request, tournament_id)

            doc["initialFen"] = doc.get("if", "")

            if uci_moves:
                game_doc_list.append(
                    {
                        "id": doc["_id"],
                        "variant": variant,
                        "is960": doc.get("z", 0),
                        "users": doc["us"],
                        "result": doc["r"],
                        "fen": doc.get("f"),
                        "moves": [*map(decode_method, doc["m"])],
                    }
                )
            else:
                if doc["s"] <= STARTED and variant == "fogofwar":
                    doc["f"] = DARK_FEN
                    doc["lm"] = ""
                    doc["m"] = ""

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
            log.error(
                "cancel_invite() KeyError. Invite %s for game %s was already deleted!",
                seek_id,
                gameId,
            )

    return web.HTTPFound("/")


async def subscribe_invites(request):
    app_state = get_app_state(request.app)
    gameId = request.match_info.get("gameId")

    queue = asyncio.Queue()
    if gameId not in app_state.invite_channels:
        app_state.invite_channels[gameId] = set()
    app_state.invite_channels[gameId].add(queue)

    try:
        async with sse_response(request) as response:
            while response.is_connected():
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_GET_TIMEOUT)
                    await response.send(payload)
                    queue.task_done()
                except asyncio.TimeoutError:
                    if not response.is_connected():
                        break
    except Exception:
        pass
    finally:
        app_state.invite_channels[gameId].discard(queue)
    return response


async def subscribe_games(request):
    app_state = get_app_state(request.app)
    queue = asyncio.Queue()
    app_state.game_channels.add(queue)
    try:
        async with sse_response(request) as response:
            while response.is_connected():
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_GET_TIMEOUT)
                    await response.send(payload)
                    queue.task_done()
                except asyncio.TimeoutError:
                    if not response.is_connected():
                        break
    except Exception:
        pass
    finally:
        app_state.game_channels.discard(queue)
    return response


async def get_games(request):
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
                "fen": DARK_FEN if game.variant == "fogofwar" else game.board.fen,
                "lastMove": "" if game.variant == "fogofwar" else game.lastmove,
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
                {"$expr": {"s": {"$gt": STARTED}}},  # prevent leaking ongoing fogofwar game info
                {"$expr": {"$eq": [{"$year": "$d"}, int(yearmonth[:4])]}},
                {"$expr": {"$eq": [{"$month": "$d"}, int(yearmonth[4:])]}},
            ]
        }
        cursor = app_state.db.game.find(filter_cond)

    if cursor is None:
        return web.Response(text="")

    response = web.StreamResponse()
    response.content_type = "text/pgn"
    await response.prepare(request)
    try:
        async for doc in cursor:
            try:
                # print(game_counter)
                # log.info("%s %s %s" % (doc["d"].strftime("%Y.%m.%d"), doc["_id"], C2V[doc["v"]]))
                pgn_text = pgn(doc)
                if pgn_text is not None:
                    await response.write(pgn_text.encode())
                    await asyncio.sleep(0)
                game_counter += 1
            except Exception:
                failed += 1
                log.error(
                    "Failed to pgn export game %s %s %s (early games may contain invalid moves)",
                    doc["_id"],
                    C2V[doc["v"]],
                    doc["d"].strftime("%Y.%m.%d"),
                )
                continue
        print("failed/all:", failed, game_counter)
    except ConnectionResetError:
        print("Client disconnected unexpectedly.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        try:
            await response.write_eof()
        except ConnectionResetError:
            print("Connection already closed, cannot write EOF.")
    return response
