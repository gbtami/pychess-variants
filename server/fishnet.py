from __future__ import annotations
from typing import TYPE_CHECKING, cast
import asyncio
import math
import hashlib
from datetime import datetime, timezone
from time import monotonic
from pathlib import Path

from aiohttp import web

from broadcast import round_broadcast
from catalogued_variants import (
    catalogued_variant_ai_disabled,
    catalogued_variant_allows_fishnet,
    clear_catalogued_variant_ai_failures,
    record_catalogued_variant_ai_failure,
    extract_variant_base_name,
)
from const import ANALYSIS, MOVE, STARTED
from typing_defs import (
    AnalysisStep,
    FishnetAbortPayload,
    FishnetAcquirePayload,
    FishnetAnalysisItem,
    FishnetAnalysisPayload,
    FishnetKeyPayload,
    FishnetMovePayload,
    FishnetScore,
    FishnetWork,
)

if TYPE_CHECKING:
    from game import Game
    from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from request_utils import read_json_data
from settings import FISHNET_KEYS
from utils import load_game, play_move
from json_utils import json_response
import logging

log = logging.getLogger(__name__)

REQUIRED_FISHNET_VERSION = "1.16.64"
MOVE_WORK_TIME_OUT = 5.0
ANALYSIS_WORK_TIME_OUT = 15 * 60.0
FISHNET_ACTIVITY_TIMEOUT = 10 * 60.0
ENGINE_CRASH_REASON = "engine_crash"
ENGINE_TIMEOUT_REASON = "engine_timeout"
STALE_WORK_TIMEOUT_REASON = "work_timeout"
VARIANT_AI_DISABLED_REASON = "variant_ai_disabled"
ENGINE_FAILURE_REASONS = frozenset((ENGINE_CRASH_REASON, ENGINE_TIMEOUT_REASON))
CATALOGUED_QUARANTINE_REASONS = frozenset(
    (ENGINE_CRASH_REASON, ENGINE_TIMEOUT_REASON, STALE_WORK_TIMEOUT_REASON)
)
# Keep generic abort limits conservative so transient worker/network issues do not
# adjudicate games too aggressively. Explicit engine failures use a tighter limit.
MOVE_ABORT_LIMIT = 6
MOVE_ENGINE_CRASH_LIMIT = 2
ANALYSIS_ABORT_LIMIT = 4
ANALYSIS_ENGINE_CRASH_LIMIT = 2
# A stale reissue means fishnet acquired the job, but the backend did not receive
# a move, analysis update, or explicit abort before the work timeout. Count these
# separately so a dead worker/process cannot make the same job circulate forever.
MOVE_STALE_REISSUE_LIMIT = 6
ANALYSIS_STALE_REISSUE_LIMIT = 2


FISHNET_VARIANTS_PAYLOAD_CACHE_SIZE = 128


def _fishnet_variants_payload_cache(
    app_state: PychessGlobalAppState,
) -> dict[str, dict[str, str]]:
    cache = getattr(app_state, "fishnet_variant_payloads", None)
    if cache is None:
        cache = {}
        setattr(app_state, "fishnet_variant_payloads", cache)
    return cache


def _cache_fishnet_variants_payload(
    app_state: PychessGlobalAppState, payload: dict[str, str]
) -> dict[str, str]:
    cache = _fishnet_variants_payload_cache(app_state)
    sha256 = payload["variantsSha256"]
    cache[sha256] = payload
    while len(cache) > FISHNET_VARIANTS_PAYLOAD_CACHE_SIZE:
        cache.pop(next(iter(cache)))
    return payload


def _catalogued_doc_base_name(doc: dict[str, object]) -> str:
    base_name = str(doc.get("baseVariant") or "").strip()
    if base_name:
        return base_name
    try:
        return extract_variant_base_name(str(doc.get("ini") or "")).strip()
    except Exception:
        return ""


def _catalogued_fishnet_ini_docs(
    app_state: PychessGlobalAppState, variant_name: str | None
) -> list[dict[str, object]]:
    """Return enabled, AI-allowed catalogued docs needed by one fishnet job.

    Fishnet workers used to receive every enabled user-defined variant in one
    global variants.ini. That means one bad unrelated section could poison every
    worker as soon as the file was loaded. For a concrete move/analysis job we
    only need the requested catalogued variant plus any catalogued base chain;
    built-in bases already live in the repository variants.ini.
    """

    catalogued_docs = getattr(app_state, "catalogued_variants", {})
    if not variant_name:
        return [
            doc
            for doc in sorted(
                catalogued_docs.values(), key=lambda item: str(item.get("name", ""))
            )
            if doc.get("enabled", True)
            and doc.get("ini")
            and not catalogued_variant_ai_disabled(doc)
        ]

    doc = catalogued_docs.get(variant_name)
    if doc is None:
        return []

    chain: list[dict[str, object]] = []
    seen: set[str] = set()
    current: dict[str, object] | None = doc
    while current is not None:
        name = str(current.get("name") or "")
        if not name or name in seen:
            break
        seen.add(name)

        if (
            not current.get("enabled", True)
            or not current.get("ini")
            or catalogued_variant_ai_disabled(current)
        ):
            return []

        chain.append(current)
        base_name = _catalogued_doc_base_name(current)
        base_doc = catalogued_docs.get(base_name) if base_name else None
        current = base_doc

    chain.reverse()
    return chain


def fishnet_variants_ini(
    app_state: PychessGlobalAppState, variant_name: str | None = None
) -> str:
    """Return the Fairy-Stockfish variant config fishnet workers should use.

    When variant_name is provided, include only the catalogued variant needed by
    that job. The unscoped/full payload is retained for diagnostics and older
    clients, but current workers receive per-work scoped payloads.
    """

    base_path = Path(__file__).resolve().parents[1] / "variants.ini"
    base_ini = base_path.read_text(encoding="utf-8")
    catalogued_ini = "\n\n".join(
        str(doc["ini"]).strip()
        for doc in _catalogued_fishnet_ini_docs(app_state, variant_name)
    )
    return "\n\n".join(part.strip() for part in (base_ini, catalogued_ini) if part.strip()) + "\n"


def fishnet_variants_payload(
    app_state: PychessGlobalAppState, variant_name: str | None = None
) -> dict[str, str]:
    variants_ini = fishnet_variants_ini(app_state, variant_name)
    payload = {
        "variantsIni": variants_ini,
        "variantsSha256": hashlib.sha256(variants_ini.encode("utf-8")).hexdigest(),
    }
    if variant_name:
        payload["variantsScope"] = variant_name
    return _cache_fishnet_variants_payload(app_state, payload)


def _attach_variants_hash(app_state: PychessGlobalAppState, work: FishnetWork) -> None:
    variant_name = str(work.get("variant") or "")
    payload = fishnet_variants_payload(app_state, variant_name)
    work["variantsSha256"] = payload["variantsSha256"]
    work["variantsScope"] = payload.get("variantsScope", "")


async def fishnet_variants(request: web.Request) -> web.Response:
    key = request.match_info["key"]
    if key not in FISHNET_KEYS:
        return web.Response(status=404)

    app_state = get_app_state(request.app)
    requested_sha256 = request.query.get("sha256")
    variant_name = request.query.get("variant")

    if requested_sha256:
        cached = _fishnet_variants_payload_cache(app_state).get(requested_sha256)
        if cached is not None and (
            not variant_name or catalogued_variant_allows_fishnet(app_state, variant_name)
        ):
            return json_response(cached)

    payload = fishnet_variants_payload(app_state, variant_name)
    if requested_sha256 and payload["variantsSha256"] != requested_sha256:
        log.warning(
            "Fishnet requested variants.ini hash %s for variant %s, but current hash is %s",
            requested_sha256,
            variant_name or "<full>",
            payload["variantsSha256"],
        )
    return json_response(payload)


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


def _winning_chances(score: FishnetScore) -> float:
    """Convert a fishnet score dict to winning chances in [-1.0, 1.0] from White's POV.

    Formula and mate conversion match pychess client/analysis/winningChances.ts,
    which mirrors https://github.com/lichess-org/lila/blob/master/ui/ceval/src/winningChances.ts.
    """
    if "mate" in score:
        mate = score["mate"]
        cp = (21 - min(10, abs(mate))) * 100 * (1 if mate > 0 else -1)
    else:
        cp = max(-1000, min(1000, score.get("cp", 0)))
    return 2 / (1 + math.exp(-0.004 * cp)) - 1


def _should_save_analysis_pv(
    analysis: FishnetAnalysisItem,
    prev: FishnetAnalysisItem | None,
    turn_color: str | None,
    ply: int,
) -> bool:
    """Decide whether the engine PV for this step is worth persisting.

    Save PV only for an inaccuracy, mistake, or blunder (winning chances drop >= 10%).
    Thresholds from lila: github.com/lichess-org/lila/blob/master/modules/tree/src/main/Advice.scala

    turn_color is the color to move *after* this step (game.steps[i]["turnColor"]),
    so "black" means White just moved and "white" means Black just moved. When
    turnColor is missing (legacy/malformed step data) we fall back to ply parity.
    """
    if "pv" not in analysis or prev is None:
        return False
    if "score" not in analysis or "score" not in prev:
        # Defensive guard against a future {"skipped": True}-style payload shape
        # (pychess does not send skipPositions today, but this keeps the function
        # itself safe to call with a malformed/partial FishnetAnalysisItem).
        return False
    white_delta = _winning_chances(analysis["score"]) - _winning_chances(prev["score"])
    if turn_color == "black":
        drop = -white_delta
    elif turn_color == "white":
        drop = white_delta
    else:
        drop = -white_delta if ply % 2 == 1 else white_delta
    return drop >= 0.1


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


def _fishnet_worker_is_recent(
    app_state: PychessGlobalAppState, key: str, now: float
) -> bool:
    return now - app_state.fishnet_worker_last_seen.get(key, 0.0) <= FISHNET_ACTIVITY_TIMEOUT


def prune_stale_fishnet_workers(
    app_state: PychessGlobalAppState, *, now: float | None = None
) -> int:
    if now is None:
        now = monotonic()

    stale_keys = [
        key
        for key in tuple(app_state.workers)
        if not _fishnet_worker_is_recent(app_state, key, now)
    ]
    monitor = getattr(app_state, "fishnet_monitor", None)
    for key in stale_keys:
        app_state.workers.discard(key)
        app_state.fishnet_worker_last_seen.pop(key, None)
        worker = FISHNET_KEYS.get(key, key)
        if monitor is not None:
            monitor[worker].append(
                "%s %s %s" % (datetime.now(timezone.utc), "-", "timed out")
            )

    if stale_keys and len(app_state.workers) == 0:
        users = app_state.users
        if "Fairy-Stockfish" in users:
            users["Fairy-Stockfish"].online = False

    return len(stale_keys)


def has_recent_fishnet_activity(
    app_state: PychessGlobalAppState, *, now: float | None = None
) -> bool:
    if now is None:
        now = monotonic()

    return any(_fishnet_worker_is_recent(app_state, key, now) for key in app_state.workers)


def has_available_fishnet_worker(
    app_state: PychessGlobalAppState, *, now: float | None = None
) -> bool:
    prune_stale_fishnet_workers(app_state, now=now)
    return len(app_state.workers) > 0


def has_pending_analysis_work_for_game(app_state: PychessGlobalAppState, game_id: str) -> bool:
    return any(
        work["work"]["type"] == "analysis" and work["game_id"] == game_id
        for work in app_state.fishnet_works.values()
    )


def _engine_failure_count(work: FishnetWork) -> int:
    # engine_crash_count is kept as a fallback for work created by older server code.
    return work.get("engine_failure_count", work.get("engine_crash_count", 0))


def _stale_reissue_limit(work: FishnetWork) -> int:
    return (
        ANALYSIS_STALE_REISSUE_LIMIT
        if work["work"]["type"] == "analysis"
        else MOVE_STALE_REISSUE_LIMIT
    )


def _stale_reissue_count(work: FishnetWork) -> int:
    return work.get("stale_reissue_count", 0)


def _is_terminal_stale_reissue(work: FishnetWork) -> bool:
    return _stale_reissue_count(work) >= _stale_reissue_limit(work)


def _is_terminal_abort(work: FishnetWork, abort_reason: str) -> bool:
    abort_count = work.get("abort_count", 0)
    engine_failure_count = _engine_failure_count(work)
    if work["work"]["type"] == "move":
        return (abort_count >= MOVE_ABORT_LIMIT) or (
            abort_reason in ENGINE_FAILURE_REASONS
            and engine_failure_count >= MOVE_ENGINE_CRASH_LIMIT
        )
    return (abort_count >= ANALYSIS_ABORT_LIMIT) or (
        abort_reason in ENGINE_FAILURE_REASONS
        and engine_failure_count >= ANALYSIS_ENGINE_CRASH_LIMIT
    )


def _work_variant_allows_fishnet(app_state: PychessGlobalAppState, work: FishnetWork) -> bool:
    return catalogued_variant_allows_fishnet(app_state, str(work.get("variant") or ""))


async def _record_terminal_catalogued_ai_failure(
    app_state: PychessGlobalAppState,
    work: FishnetWork,
    failure_reason: str,
) -> None:
    if failure_reason not in CATALOGUED_QUARANTINE_REASONS:
        return
    await record_catalogued_variant_ai_failure(
        app_state,
        str(work.get("variant") or ""),
        failure_reason,
    )


async def _adjudicate_failing_move_work(
    app_state: PychessGlobalAppState, work_id: str, work: FishnetWork, failure_reason: str
) -> None:
    game = await load_game(app_state, work["game_id"])
    if game is None:
        return
    if TYPE_CHECKING:
        assert isinstance(game, Game)

    if game.status > STARTED:
        return

    log.warning(
        "Adjudicating move work %s as engine loss after repeated fishnet failures "
        "(reason=%s, aborts=%s, engine_failures=%s, stale_reissues=%s)",
        work_id,
        failure_reason,
        work.get("abort_count", 0),
        _engine_failure_count(work),
        _stale_reissue_count(work),
    )

    bot_user = app_state.users["Fairy-Stockfish"]
    async with game.move_lock:
        response = await game.game_ended(bot_user, "resign")

    # Ensure bot loops also receive terminal state and can clean up game tasks.
    for player in (game.wplayer, game.bplayer):
        if player.bot and game.id in player.game_queues:
            await player.game_queues[game.id].put(game.game_end)

    await round_broadcast(game, response, full=True)


async def _drop_terminal_work_failure(
    app_state: PychessGlobalAppState, work_id: str, work: FishnetWork, failure_reason: str
) -> None:
    await _record_terminal_catalogued_ai_failure(app_state, work, failure_reason)
    del app_state.fishnet_works[work_id]
    if work["work"]["type"] == "move":
        await _adjudicate_failing_move_work(app_state, work_id, work, failure_reason)
    else:
        log.warning(
            "Dropping analysis work %s after repeated fishnet failures "
            "(reason=%s, aborts=%s, engine_failures=%s, stale_reissues=%s)",
            work_id,
            failure_reason,
            work.get("abort_count", 0),
            _engine_failure_count(work),
            _stale_reissue_count(work),
        )


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
    except web.HTTPBadRequest:
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
        if not _work_variant_allows_fishnet(app_state, work):
            log.warning(
                "Dropping fishnet work %s because AI is temporarily disabled for variant %s",
                work_id,
                work.get("variant"),
            )
            await _drop_terminal_work_failure(
                app_state, work_id, work, VARIANT_AI_DISABLED_REASON
            )
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

        _attach_variants_hash(app_state, work)
        return json_response(work, status=202)

    # There was no new work in the queue. Ok
    # Now let see are there any long time pending work in app[fishnet_works_key]
    # (in case when worker grabbed it from queue but not responded after timeout)
    now = monotonic()
    for work_id, work_item in tuple(app_state.fishnet_works.items()):
        if not _work_variant_allows_fishnet(app_state, work_item):
            log.warning(
                "Dropping stale fishnet work %s because AI is temporarily disabled for variant %s",
                work_id,
                work_item.get("variant"),
            )
            await _drop_terminal_work_failure(
                app_state, work_id, work_item, VARIANT_AI_DISABLED_REASON
            )
            continue
        if now - work_item["time"] <= _work_timeout(work_item):
            continue

        work_item["stale_reissue_count"] = _stale_reissue_count(work_item) + 1
        work_item["last_abort_reason"] = STALE_WORK_TIMEOUT_REASON
        if _is_terminal_stale_reissue(work_item):
            fm[worker].append(
                "%s %s %s %s"
                % (
                    datetime.now(timezone.utc),
                    work_id,
                    "drop",
                    "%s after %s stale reissues"
                    % (work_item["work"]["type"], _stale_reissue_count(work_item)),
                )
            )
            await _drop_terminal_work_failure(
                app_state, work_id, work_item, STALE_WORK_TIMEOUT_REASON
            )
            continue

        fm[worker].append(
            "%s %s %s %s"
            % (
                datetime.now(timezone.utc),
                work_id,
                "request",
                "%s AGAIN (%s/%s)"
                % (
                    work_item["work"]["type"],
                    _stale_reissue_count(work_item),
                    _stale_reissue_limit(work_item),
                ),
            )
        )
        work_item["time"] = now
        _attach_variants_hash(app_state, work_item)
        return json_response(work_item, status=202)
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
        if analysis is None:
            continue

        # `existing` may already hold a partial record (created on an earlier,
        # partial progress report from fairyfishnet with prev=None at the time,
        # so "p" could not yet be evaluated). We must keep re-entering this
        # branch on later reports so a PV that becomes decidable once its
        # neighbour ply arrives can still be added — the old code's
        # `if "analysis" not in game.steps[i]:` gate closed this permanently
        # after the first report, which is the bug this restructure fixes.
        existing: AnalysisStep | None = game.steps[i].get("analysis")
        created = existing is None

        if created:
            step_analysis: AnalysisStep = {"s": analysis["score"]}
            if "depth" in analysis:
                step_analysis["d"] = analysis["depth"]
            game.steps[i]["analysis"] = step_analysis
        else:
            step_analysis = existing

        prev = data["analysis"][i - 1] if i > 0 else None
        turn_color = game.steps[i].get("turnColor")

        added_pv = False
        if "p" not in step_analysis and _should_save_analysis_pv(analysis, prev, turn_color, i):
            step_analysis["p"] = analysis["pv"]
            added_pv = True

        # Nothing new to tell the client: this step already existed before this
        # report AND nothing changed on it during this pass. Re-sending would be
        # a redundant duplicate "analysis" message for a step the client already has.
        if not created and not added_pv:
            continue

        ply = str(i)
        response = {
            "type": "analysis",
            "ply": ply,
            "color": "w" if i % 2 == 0 else "b",
            # step_analysis IS game.steps[i]["analysis"] (same dict object in both
            # branches above), so this reflects any "p" just added.
            "ceval": step_analysis,
        }
        await app_state.users[username].send_game_message(gameId, response)

    # remove completed work
    if all(data["analysis"]):
        del app_state.fishnet_works[work_id]
        await clear_catalogued_variant_ai_failures(app_state, str(work.get("variant") or ""))
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

    await clear_catalogued_variant_ai_failures(app_state, str(work.get("variant") or ""))

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
    if abort_reason in ENGINE_FAILURE_REASONS:
        work["engine_failure_count"] = _engine_failure_count(work) + 1
        if abort_reason == ENGINE_CRASH_REASON:
            work["engine_crash_count"] = work.get("engine_crash_count", 0) + 1

    if _is_terminal_abort(work, abort_reason):
        await _drop_terminal_work_failure(app_state, work_id, work, abort_reason)
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
    return json_response(workers)
