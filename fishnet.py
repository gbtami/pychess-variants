import asyncio
from datetime import datetime
from functools import partial
import json

from aiohttp import web

from utils import ANALYSIS, load_game
from settings import FISHNET_KEYS


async def fishnet_acquire(request):
    data = await request.json()

    fm = request.app["fishnet_monitor"]
    fv = request.app["fishnet_versions"]
    key = data["fishnet"]["apikey"]
    version = data["fishnet"]["version"]
    worker = FISHNET_KEYS[key]
    fv[worker] = version
    FISHNET_KEYS[key] = (FISHNET_KEYS[key])

    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    if key not in request.app["workers"]:
        request.app["workers"].add(key)
        fm[worker].append("%s %s %s" % (datetime.utcnow(), "-", "joined"))

    fishnet_work_queue = request.app["fishnet"]

    # priority can be "move" or "analysis"
    try:
        (priority, work_id) = fishnet_work_queue.get_nowait()
        work = request.app["works"][work_id]
        # print(work)
        if priority == ANALYSIS:
            fm[worker].append("%s %s %s %s of %s moves" % (datetime.utcnow(), work_id, "request", "analysis", work["moves"].count(" ") + 1))

            # delete previous analysis
            gameId = work["game_id"]
            game = await load_game(request.app, gameId)
            for step in game.steps:
                if "analysis" in step:
                    del step["analysis"]

            users = request.app["users"]
            user_ws = users[work["username"]].game_sockets[work["game_id"]]
            response = {"type": "roundchat", "user": "", "room": "spectator", "message": "Work for fishnet sent..."}
            await user_ws.send_json(response)
        else:
            fm[worker].append("%s %s %s %s for level %s" % (datetime.utcnow(), work_id, "request", "move", work["level"]))

        return web.json_response(work, status=202)
    except asyncio.QueueEmpty:
        return web.Response(status=204)
    except Exception:
        raise


async def fishnet_analysis(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    fm = request.app["fishnet_monitor"]
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    # print(json.dumps(data, sort_keys=True, indent=4))
    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    work = request.app["works"][work_id]
    fm[worker].append("%s %s %s" % (datetime.utcnow(), work_id, "analysis"))

    gameId = work["game_id"]
    game = await load_game(request.app, gameId)

    bot_name = data["stockfish"]["name"]

    users = request.app["users"]
    username = work["username"]
    user_ws = users[username].game_sockets[gameId]

    length = len(data["analysis"])
    for j, analysis in enumerate(reversed(data["analysis"])):
        i = length - j - 1
        if analysis is not None:
            if "analysis" not in game.steps[i]:
                game.steps[i]["analysis"] = analysis
            else:
                continue

            ply = str(i)
            response = {"type": "roundchat", "user": bot_name, "room": "spectator", "message": ply + " " + json.dumps(analysis)}
            await user_ws.send_json(response)

            response = {"type": "analysis", "ply": ply, "color": "w" if i % 2 == 0 else "b", "ceval": analysis}
            await user_ws.send_json(response)

    # remove completed work
    if all(data["analysis"]):
        del request.app["works"][work_id]

    return web.Response(status=204)


async def fishnet_move(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    fm = request.app["fishnet_monitor"]
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    # print(json.dumps(data, sort_keys=True, indent=4))
    if data["fishnet"]["apikey"] not in FISHNET_KEYS:
        return web.Response(status=404)

    fm[worker].append("%s %s %s" % (datetime.utcnow(), work_id, "move"))

    # remove completed work
    del request.app["works"][work_id]

    return web.Response(status=204)


async def fishnet_abort(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    fm = request.app["fishnet_monitor"]
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    if data["fishnet"]["apikey"] not in FISHNET_KEYS:
        return web.Response(status=404)

    fm[worker].append("%s %s %s" % (datetime.utcnow(), work_id, "abort"))

    # remove fishnet client
    request.app["workers"].remove(data["fishnet"]["apikey"])

    # re-schedule the job
    request.app["fishnet"].put_nowait((ANALYSIS, work_id))

    return web.Response(status=204)


async def fishnet_key(request):
    key = request.match_info.get("key")
    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    return web.Response()


async def fishnet_monitor(request):
    fm = request.app["fishnet_monitor"]
    fv = request.app["fishnet_versions"]
    workers = {worker + " v" + fv[worker]: list(fm[worker]) for worker in fm if fm[worker]}
    return web.json_response(workers, dumps=partial(json.dumps, default=datetime.isoformat))
