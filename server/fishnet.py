from __future__ import annotations
from typing import TYPE_CHECKING, cast
import asyncio
import json
from datetime import datetime, timezone
from functools import partial
from time import monotonic

from aiohttp import web

from broadcast import round_broadcast
from const import ANALYSIS, MOVE, STARTED
from typing_defs import (
    FishnetAbortPayload,
    FishnetAcquirePayload,
    FishnetAnalysisPayload,
    FishnetKeyPayload,
    FishnetMovePayload,
    FishnetWork,
)

if TYPE_CHECKING:
    from game import Game
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from request_utils import read_json_data
from settings import FISHNET_KEYS
from utils import load_game, play_move
import logging

log = logging.getLogger(__name__)

REQUIRED_FISHNET_VERSION = "1.16.42"
MOVE_WORK_TIME_OUT = 5.0
ANALYSIS_WORK_TIME_OUT = 15 * 60.0
FISHNET_ACTIVITY_TIMEOUT = 10 * 60.0
ENGINE_CRASH_REASON = "engine_crash"
# Keep generic abort limits conservative so transient worker/network issues do not
# adjudicate games too aggressively. Explicit engine crashes use a tighter limit.
MOVE_ABORT_LIMIT = 6
MOVE_ENGINE_CRASH_LIMIT = 2
ANALYSIS_ABORT_LIMIT = 4
ANALYSIS_ENGINE_CRASH_LIMIT = 2


def _work_priority(work: FishnetWork) -> int:
    return ANALYSIS if work["work"]["type"] == "analysis" else MOVE


def _abort_reason(data: FishnetAbortPayload) -> str:
    error = data.get("error")
    if error is None:
        return "unknown"
    reason = error.get("reason")
    return reason if reason else "unknown"


def _work_timeout(work: FishnetWork) -> float:
    return ANALYSIS_WORK_TIME_OUT if work["work"]["type"] == "analysis" else MOVE_WORK_TIME_OUT


def drop_stale_analysis_work(app_state: PychessGlobalAppState, *, now: float | None = None) -> int:
    if now is None:
        now = monotonic()

    stale_ids = [
        work_id
        for work_id, work in tuple(app_state.fishnet_works.items())
        if work["work"]["type"] == "analysis"
        and now - work.get("time", now) > ANALYSIS_WORK_TIME_OUT
    ]
    for work_id in stale_ids:
        del app_state.fishnet_works[work_id]
    return len(stale_ids)


def has_recent_fishnet_activity(
    app_state: PychessGlobalAppState, *, now: float | None = None
) -> bool:
    if now is None:
        now = monotonic()

    return any(
        now - app_state.fishnet_worker_last_seen.get(key, 0.0) <= FISHNET_ACTIVITY_TIMEOUT
        for key in app_state.workers
    )


def has_pending_analysis_work_for_game(app_state: PychessGlobalAppState, game_id: str) -> bool:
    return any(
        work["work"]["type"] == "analysis" and work["game_id"] == game_id
        for work in app_state.fishnet_works.values()
    )


def _is_terminal_abort(work: FishnetWork, abort_reason: str) -> bool:
    abort_count = work.get("abort_count", 0)
    engine_crash_count = work.get("engine_crash_count", 0)
    if work["work"]["type"] == "move":
        return (abort_count >= MOVE_ABORT_LIMIT) or (
            abort_reason == ENGINE_CRASH_REASON and engine_crash_count >= MOVE_ENGINE_CRASH_LIMIT
        )
    return (abort_count >= ANALYSIS_ABORT_LIMIT) or (
        abort_reason == ENGINE_CRASH_REASON and engine_crash_count >= ANALYSIS_ENGINE_CRASH_LIMIT
    )


async def _adjudicate_failing_move_work(
    app_state: PychessGlobalAppState, work_id: str, work: FishnetWork, abort_reason: str
) -> None:
    game = await load_game(app_state, work["game_id"])
    if game is None:
        return
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    if game.status > STARTED:
        return

    log.warning(
        "Adjudicating move work %s as engine loss after repeated aborts (reason=%s, aborts=%s, crashes=%s)",
        work_id,
        abort_reason,
        work.get("abort_count", 0),
        work.get("engine_crash_count", 0),
    )

    bot_user = app_state.users["Fairy-Stockfish"]
    async with game.move_lock:
        response = await game.game_ended(bot_user, "resign")

    # Ensure bot loops also receive terminal state and can clean up game tasks.
    for player in (game.wplayer, game.bplayer):
        if player.bot and game.id in player.game_queues:
            await player.game_queues[game.id].put(game.game_end)

    await round_broadcast(game, response, full=True)


async def _read_fishnet_json(request: web.Request) -> tuple[object | None, int | None]:
    try:
        data = await read_json_data(request)
        if data is not None:
            return data, None
        log.debug(
            "Fishnet request body read aborted on %s from %s",
            request.rel_url.path,
            request.remote,
        )
        return None, 204
    except (json.JSONDecodeError, web.HTTPBadRequest):
        log.debug(
            "Invalid fishnet JSON payload on %s from %s",
            request.rel_url.path,
            request.remote,
        )
        return None, 400


async def get_work(
    app_state: PychessGlobalAppState,
    data: FishnetKeyPayload | FishnetAcquirePayload | FishnetAnalysisPayload | FishnetMovePayload,
) -> web.Response:
    fm = app_state.fishnet_monitor
    key = data["fishnet"]["apikey"]
    worker = FISHNET_KEYS[key]

    fishnet_work_queue = app_state.fishnet_queue

    # priority can be "move" or "analysis"
    while True:
        try:
            (priority, work_id) = fishnet_work_queue.get_nowait()
            try:
                fishnet_work_queue.task_done()
            except ValueError:
                log.error(
                    "task_done() called more times than there were items placed in the queue in fishnet.py get_work()"
                )
        except asyncio.QueueEmpty:
            break

        work = app_state.fishnet_works.get(work_id)
        if work is None:
            log.debug("Skipping stale fishnet queue item %s", work_id)
            continue

        # Track the latest assignment time so timeout-based re-acquire does not
        # immediately recycle the same work while another worker is processing it.
        work["time"] = monotonic()

        # Trust the work payload type over queue metadata. This also recovers from
        # legacy enqueue mistakes where priority did not match work type.
        priority = _work_priority(work)
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

    # There was no new work in the queue. Ok
    # Now let see are there any long time pending work in app[fishnet_works_key]
    # (in case when worker grabbed it from queue but not responded after timeout)
    now = monotonic()
    for work_id, work_item in app_state.fishnet_works.items():
        if now - work_item["time"] > _work_timeout(work_item):
            fm[worker].append(
                "%s %s %s %s"
                % (
                    datetime.now(timezone.utc),
                    work_id,
                    "request",
                    "%s AGAIN" % work_item["work"]["type"],
                )
            )
            work_item["time"] = now
            return web.json_response(work_item, status=202)
    return web.Response(status=204)


async def fishnet_acquire(request: web.Request) -> web.Response:
    data_obj, error_status = await _read_fishnet_json(request)
    if data_obj is None:
        return web.Response(status=error_status or 400)
    # Fishnet payloads come from our own worker implementation, so we keep this boundary trusted.
    data = cast(FishnetAcquirePayload, data_obj)

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]
    version = data["fishnet"]["version"]
    en = data["stockfish"]["name"]
    nnue = data["stockfish"].get("nnue", "")

    if (key not in FISHNET_KEYS) or version < REQUIRED_FISHNET_VERSION:
        return web.Response(status=404)

    worker = FISHNET_KEYS[key]
    app_state.fishnet_worker_last_seen[key] = monotonic()
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


async def fishnet_analysis(request: web.Request) -> web.Response:
    work_id = request.match_info["workId"]
    data_obj, error_status = await _read_fishnet_json(request)
    if data_obj is None:
        return web.Response(status=error_status or 400)
    # Fishnet payloads come from our own worker implementation, so we keep this boundary trusted.
    data = cast(FishnetAnalysisPayload, data_obj)

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)
    worker = FISHNET_KEYS[key]
    app_state.fishnet_worker_last_seen[key] = monotonic()

    if work_id not in app_state.fishnet_works:
        response = await get_work(app_state, data)
        return response

    work: FishnetWork = app_state.fishnet_works[work_id]
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


async def fishnet_move(request: web.Request) -> web.Response:
    work_id = request.match_info["workId"]
    data_obj, error_status = await _read_fishnet_json(request)
    if data_obj is None:
        return web.Response(status=error_status or 400)
    # Fishnet payloads come from our own worker implementation, so we keep this boundary trusted.
    data = cast(FishnetMovePayload, data_obj)

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)
    worker = FISHNET_KEYS[key]
    app_state.fishnet_worker_last_seen[key] = monotonic()

    app_state.fishnet_monitor[worker].append(
        "%s %s %s" % (datetime.now(timezone.utc), work_id, "move")
    )

    if work_id not in app_state.fishnet_works:
        response = await get_work(app_state, data)
        return response

    work: FishnetWork = app_state.fishnet_works[work_id]
    gameId = work["game_id"]

    # remove work from works
    del app_state.fishnet_works[work_id]

    game = await load_game(app_state, gameId)
    if game is None:
        return web.Response(status=204)
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    user = app_state.users["Fairy-Stockfish"]
    move = data["move"]["bestmove"]
    fen = data["move"].get("fen")

    # Allow to make fishnet move if no takeback changed the current FEN
    if fen is None or fen == game.board.fen:
        async with game.move_lock:
            await play_move(app_state, user, game, move)
    else:
        log.info("DISCARD FISHNET move %s", move)

    response = await get_work(app_state, data)
    return response


async def fishnet_abort(request: web.Request) -> web.Response:
    work_id = request.match_info["workId"]
    data_obj, error_status = await _read_fishnet_json(request)
    if data_obj is None:
        return web.Response(status=error_status or 400)
    # Fishnet payloads come from our own worker implementation, so we keep this boundary trusted.
    data = cast(FishnetAbortPayload, data_obj)

    app_state = get_app_state(request.app)
    key = data["fishnet"]["apikey"]

    if key not in FISHNET_KEYS:
        return web.Response(status=404)
    worker = FISHNET_KEYS[key]
    abort_reason = _abort_reason(data)
    app_state.fishnet_worker_last_seen[key] = monotonic()

    app_state.fishnet_monitor[worker].append(
        "%s %s %s (%s)" % (datetime.now(timezone.utc), work_id, "abort", abort_reason)
    )

    # remove fishnet client
    try:
        app_state.workers.remove(data["fishnet"]["apikey"])
    except KeyError:
        log.debug("Worker %s was already removed", worker)
    app_state.fishnet_worker_last_seen.pop(key, None)
    no_workers = len(app_state.workers) == 0

    work = app_state.fishnet_works.get(work_id)
    if work is None:
        if no_workers:
            app_state.users["Fairy-Stockfish"].online = False
        return web.Response(status=204)

    work["abort_count"] = work.get("abort_count", 0) + 1
    work["last_abort_reason"] = abort_reason
    if abort_reason == ENGINE_CRASH_REASON:
        work["engine_crash_count"] = work.get("engine_crash_count", 0) + 1

    if _is_terminal_abort(work, abort_reason):
        del app_state.fishnet_works[work_id]
        if work["work"]["type"] == "move":
            await _adjudicate_failing_move_work(app_state, work_id, work, abort_reason)
        else:
            log.warning(
                "Dropping analysis work %s after repeated aborts (reason=%s, aborts=%s, crashes=%s)",
                work_id,
                abort_reason,
                work.get("abort_count", 0),
                work.get("engine_crash_count", 0),
            )
        if no_workers:
            app_state.users["Fairy-Stockfish"].online = False
        return web.Response(status=204)

    # Re-schedule the job with correct priority.
    work["time"] = monotonic()
    app_state.fishnet_queue.put_nowait((_work_priority(work), work_id))

    if no_workers:
        app_state.users["Fairy-Stockfish"].online = False
        # TODO: msg to work user

    return web.Response(status=204)


async def fishnet_validate_key(request: web.Request) -> web.Response:
    key = request.match_info["key"]
    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    return web.Response()


async def fishnet_monitor(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    workers = {
        worker + " v" + app_state.fishnet_versions[worker]: list(app_state.fishnet_monitor[worker])
        for worker in app_state.fishnet_monitor
        if app_state.fishnet_monitor[worker]
    }
    return web.json_response(workers, dumps=partial(json.dumps, default=datetime.isoformat))
