from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timezone
from functools import partial
from time import monotonic

from aiohttp import web

from const import ANALYSIS
from const import TYPE_CHECKING

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from settings import FISHNET_KEYS
from utils import load_game, play_move

log = logging.getLogger(__name__)

REQUIRED_FISHNET_VERSION = "1.16.23"
MOVE_WORK_TIME_OUT = 5.0


async def get_work(app_state: PychessGlobalAppState, data):
    fm = app_state.fishnet_monitor
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    fishnet_work_queue = app_state.fishnet_queue

    # priority can be "move" or "analysis"
    try:
        (priority, work_id) = fishnet_work_queue.get_nowait()
        try:
            fishnet_work_queue.task_done()
        except ValueError:
            log.error(
                "task_done() called more times than there were items placed in the queue in fishnet.py get_work()"
            )

        work = app_state.fishnet_works[work_id]
        if priority == ANALYSIS:
            fm[worker].append(
                "%s %s %s %s of %s moves"
                % (
                    datetime.now(timezone.utc),
                    work_id,
                    "request",
                    "analysis",
                    work["moves"].count(" ") + 1,
                )
            )

            # delete previous analysis
            gameId = work["game_id"]
            game = await load_game(app_state, gameId)
            if game is None:
                return web.Response(status=204)

            for step in game.steps:
                if "analysis" in step:
                    del step["analysis"]

            if "username" in work:
                response = {
                    "type": "roundchat",
                    "user": "",
                    "room": "spectator",
                    "message": "Work for fishnet sent...",
                }
                await app_state.users[work["username"]].send_game_message(work["game_id"], response)
        else:
            fm[worker].append(
                "%s %s %s %s for level %s"
                % (
                    datetime.now(timezone.utc),
                    work_id,
                    "request",
                    "move",
                    work["work"]["level"],
                )
            )

        return web.json_response(work, status=202)
    except asyncio.QueueEmpty:
        # There was no new work in the queue. Ok
        # Now let see are there any long time pending work in app[fishnet_works_key]
        # (in case when worker grabbed it from queue but not responded after MOVE_WORK_TIME_OUT secs)
        now = monotonic()
        for work_id in app_state.fishnet_works:
            work = app_state.fishnet_works[work_id]
            if work["work"]["type"] == "move" and (now - work["time"] > MOVE_WORK_TIME_OUT):
                fm[worker].append(
                    "%s %s %s %s for level %s"
                    % (
                        datetime.now(timezone.utc),
                        work_id,
                        "request",
                        "move AGAIN",
                        work["work"]["level"],
                    )
                )
                return web.json_response(work, status=202)
        return web.Response(status=204)


async def fishnet_acquire(request):
    data = await request.json()

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]
    version = data["fishnet"]["version"]
    en = data["stockfish"]["name"]
    nnue = data["stockfish"].get("nnue", "")

    if (key not in FISHNET_KEYS) or version < REQUIRED_FISHNET_VERSION:
        return web.Response(status=404)

    worker = FISHNET_KEYS[key]
    app_state.fishnet_versions[worker] = "%s %s" % (version, en)

    if key not in app_state.workers:
        app_state.workers.add(key)
        app_state.fishnet_monitor[worker].append(
            "%s %s %s" % (datetime.now(timezone.utc), "-", "joined")
        )
        app_state.fishnet_monitor[worker].append(nnue)
        app_state.users["Fairy-Stockfish"].online = True

    response = await get_work(app_state, data)
    return response


async def fishnet_analysis(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    work = app_state.fishnet_works[work_id]
    app_state.fishnet_monitor[worker].append(
        "%s %s %s" % (datetime.now(timezone.utc), work_id, "analysis")
    )

    gameId = work["game_id"]
    game = await load_game(app_state, gameId)

    username = work["username"]

    length = len(data["analysis"])
    for j, analysis in enumerate(reversed(data["analysis"])):
        i = length - j - 1
        if analysis is not None:
            try:
                if "analysis" not in game.steps[i]:
                    # TODO: save PV only for inaccuracy, mistake and blunder
                    # see https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/Advice.scala
                    game.steps[i]["analysis"] = {
                        "s": analysis["score"],
                        "d": analysis["depth"],
                        "p": analysis["pv"],
                    }
                else:
                    continue
            except KeyError:
                game.steps[i]["analysis"] = {
                    "s": analysis["score"],
                }

            ply = str(i)
            # response = {"type": "roundchat", "user": bot_name, "room": "spectator", "message": ply + " " + json.dumps(analysis)}
            # await user_ws.send_json(response)

            response = {
                "type": "analysis",
                "ply": ply,
                "color": "w" if i % 2 == 0 else "b",
                "ceval": game.steps[i]["analysis"],
            }
            await app_state.users[username].send_game_message(gameId, response)

    # remove completed work
    if all(data["analysis"]):
        del app_state.fishnet_works[work_id]
        new_data = {"a": [step["analysis"] for step in game.steps]}
        await app_state.db.game.find_one_and_update({"_id": game.id}, {"$set": new_data})

    return web.Response(status=204)


async def fishnet_move(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    app_state.fishnet_monitor[worker].append(
        "%s %s %s" % (datetime.now(timezone.utc), work_id, "move")
    )

    if work_id not in app_state.fishnet_works:
        response = await get_work(app_state, data)
        return response

    work = app_state.fishnet_works[work_id]
    gameId = work["game_id"]

    # remove work from works
    del app_state.fishnet_works[work_id]

    game = await load_game(app_state, gameId)
    if game is None:
        return web.Response(status=204)

    user = app_state.users["Fairy-Stockfish"]
    move = data["move"]["bestmove"]

    await play_move(app_state, user, game, move)

    response = await get_work(app_state, data)
    return response


async def fishnet_abort(request):
    work_id = request.match_info.get("workId")
    data = await request.json()

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    app_state.fishnet_monitor[worker].append(
        "%s %s %s" % (datetime.now(timezone.utc), work_id, "abort")
    )

    # remove fishnet client
    try:
        app_state.workers.remove(data["fishnet"]["apikey"])
    except KeyError:
        log.debug("Worker %s was already removed", key)

    # re-schedule the job
    app_state.fishnet_queue.put_nowait((ANALYSIS, work_id))

    if len(app_state.workers) == 0:
        app_state.users["Fairy-Stockfish"].online = False
        # TODO: msg to work user

    return web.Response(status=204)


async def fishnet_validate_key(request):
    key = request.match_info.get("key")
    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    return web.Response()


async def fishnet_monitor(request):
    app_state = get_app_state(request.app)
    workers = {
        worker + " v" + app_state.fishnet_versions[worker]: list(app_state.fishnet_monitor[worker])
        for worker in app_state.fishnet_monitor
        if app_state.fishnet_monitor[worker]
    }
    return web.json_response(workers, dumps=partial(json.dumps, default=datetime.isoformat))
