from __future__ import annotations

import asyncio
import logging
import random
import string
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal

from catalogued_variants import catalogued_variant_allows_fishnet, replace_variant_section_name
from const import ANALYSIS
from fairy.fairy_board import FairyBoard
from typing_defs import AnalysisStep, FishnetAnalysisItem, FishnetWork
from websocket_utils import ws_send_json_many

from study.models import Study, StudyChapter, StudyServerEval
from study.permissions import can_write_study
from study.variant import study_variant_context

log = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

STUDY_ANALYSIS_MIN_MOVES = 5
STUDY_ANALYSIS_COOLDOWN = timedelta(minutes=5)
STUDY_ANALYSIS_NODES = 500_000

StudyAnalysisRequestStatus = Literal[
    "started",
    "already_requested",
    "already_done",
    "too_short",
    "forbidden",
    "not_found",
    "fishnet_unavailable",
    "variant_unavailable",
]


@dataclass(frozen=True, slots=True)
class StudyAnalysisRequestResult:
    status: StudyAnalysisRequestStatus
    server_eval: StudyServerEval | None = None
    pending: bool = False


def _new_work_id(app_state: PychessGlobalAppState) -> str:
    while True:
        work_id = "".join(random.choice(string.ascii_letters + string.digits) for _ in range(6))
        if work_id not in app_state.fishnet_works:
            return work_id


def _study_work_matches(work: FishnetWork, study_id: str, chapter_id: str) -> bool:
    return (
        work["work"]["type"] == "analysis"
        and work.get("study_id") == study_id
        and work.get("chapter_id") == chapter_id
    )


def has_pending_study_analysis(
    app_state: PychessGlobalAppState, study_id: str, chapter_id: str
) -> bool:
    return any(
        _study_work_matches(work, study_id, chapter_id) for work in app_state.fishnet_works.values()
    )


def _drop_study_analysis_works(
    app_state: PychessGlobalAppState, study_id: str, chapter_id: str | None = None
) -> int:
    works = getattr(app_state, "fishnet_works", None)
    if not works:
        return 0

    from fishnet import _compact_fishnet_queue

    ids = {
        work_id
        for work_id, work in tuple(works.items())
        if work["work"]["type"] == "analysis"
        and work.get("study_id") == study_id
        and (chapter_id is None or work.get("chapter_id") == chapter_id)
    }
    for work_id in ids:
        works.pop(work_id, None)
    if ids and hasattr(app_state, "fishnet_queue"):
        _compact_fishnet_queue(app_state)
    return len(ids)


def drop_study_analysis_work(
    app_state: PychessGlobalAppState, study_id: str, chapter_id: str
) -> int:
    return _drop_study_analysis_works(app_state, study_id, chapter_id)


def drop_study_analysis_works_for_study(app_state: PychessGlobalAppState, study_id: str) -> int:
    return _drop_study_analysis_works(app_state, study_id)


async def _load_study_and_chapter(
    app_state: PychessGlobalAppState, study_id: str, chapter_id: str
) -> tuple[Study, StudyChapter] | None:
    study_doc = await app_state.db.study.find_one({"_id": study_id})
    chapter_doc = await app_state.db.study_chapter.find_one(
        {"_id": chapter_id, "studyId": study_id}
    )
    if study_doc is None or chapter_doc is None:
        return None
    try:
        return Study.from_document(study_doc), StudyChapter.from_document(chapter_doc)
    except (TypeError, ValueError):
        return None


async def _broadcast_server_eval(
    app_state: PychessGlobalAppState,
    chapter: StudyChapter,
    server_eval: StudyServerEval,
    *,
    pending: bool,
) -> None:
    room = app_state.study_sockets.get(chapter.study_id)
    if not room:
        return
    await ws_send_json_many(
        tuple(room),
        {
            "type": "study_analysis_progress",
            "studyId": chapter.study_id,
            "chapterId": chapter.id,
            "serverEval": server_eval.to_payload(pending=pending),
        },
    )


async def _broadcast_unavailable(
    app_state: PychessGlobalAppState, study_id: str, chapter_id: str, reason: str
) -> None:
    room = app_state.study_sockets.get(study_id)
    if not room:
        return
    await ws_send_json_many(
        tuple(room),
        {
            "type": "study_analysis_unavailable",
            "studyId": study_id,
            "chapterId": chapter_id,
            "reason": reason,
        },
    )


async def request_study_server_analysis(
    app_state: PychessGlobalAppState,
    *,
    study_id: str,
    chapter_id: str,
    username: str,
    now: datetime | None = None,
) -> StudyAnalysisRequestResult:
    """Queue a Lichess-style server analysis for the preferred chapter mainline."""

    loaded = await _load_study_and_chapter(app_state, study_id, chapter_id)
    if loaded is None:
        return StudyAnalysisRequestResult("not_found")
    study, chapter = loaded
    if not can_write_study(study, username):
        return StudyAnalysisRequestResult("forbidden")

    mainline = chapter.root.preferred_mainline()
    if len(mainline) < STUDY_ANALYSIS_MIN_MOVES:
        return StudyAnalysisRequestResult("too_short", chapter.server_eval)
    path = chapter.root.preferred_mainline_path()
    current = chapter.server_eval
    if current is not None and current.path == path:
        if current.done:
            return StudyAnalysisRequestResult("already_done", current)
        if has_pending_study_analysis(app_state, study_id, chapter_id):
            return StudyAnalysisRequestResult("already_requested", current, pending=True)
        requested_at = now or datetime.now(UTC)
        if requested_at - current.requested_at < STUDY_ANALYSIS_COOLDOWN:
            return StudyAnalysisRequestResult("already_requested", current)

    from fishnet import (
        fishnet_variants_payload_from_ini,
        has_available_fishnet_worker,
    )

    if not has_available_fishnet_worker(app_state):
        return StudyAnalysisRequestResult("fishnet_unavailable", current)

    try:
        with study_variant_context(app_state, chapter.variant, chapter.variant_ini) as options:
            board = FairyBoard(
                options.runtime_variant,
                initial_fen=chapter.initial_fen,
                chess960=chapter.chess960,
                show_promoted=options.show_promoted,
                legal_moves_need_history=options.legal_moves_need_history,
            )
            work_variant = board.variant
            pinned_payload: dict[str, str] | None = None
            if chapter.variant_ini and options.runtime_variant != chapter.variant:
                aliased_ini = replace_variant_section_name(
                    chapter.variant_ini, options.runtime_variant
                )
                pinned_payload = fishnet_variants_payload_from_ini(
                    app_state, work_variant, aliased_ini
                )
    except Exception:
        log.info(
            "Study Fishnet analysis variant setup failed for %s/%s (%s)",
            study_id,
            chapter_id,
            chapter.variant,
            exc_info=True,
        )
        return StudyAnalysisRequestResult("variant_unavailable", current)

    if not catalogued_variant_allows_fishnet(app_state, work_variant):
        return StudyAnalysisRequestResult("variant_unavailable", current)

    requested_at = now or datetime.now(UTC)
    server_eval = StudyServerEval(path=path, done=False, requested_at=requested_at)
    result = await app_state.db.study_chapter.update_one(
        {"_id": chapter.id, "studyId": study.id},
        {"$set": {"serverEval": server_eval.to_document()}},
    )
    if result.matched_count != 1:
        return StudyAnalysisRequestResult("not_found")

    work_id = _new_work_id(app_state)
    work: FishnetWork = {
        "work": {"type": "analysis", "id": work_id},
        "study_id": study.id,
        "chapter_id": chapter.id,
        "study_path": path,
        "position": chapter.initial_fen,
        "variant": work_variant,
        "chess960": chapter.chess960,
        "moves": " ".join(node.move for node in mainline),
        "nnue": board.nnue,
        "nodes": STUDY_ANALYSIS_NODES,
    }
    if pinned_payload is not None:
        work["variantsSha256"] = pinned_payload["variantsSha256"]
        work["variantsScope"] = pinned_payload["variantsScope"]
    app_state.fishnet_works[work_id] = work
    app_state.fishnet_queue.put_nowait((ANALYSIS, work_id))

    chapter = replace(chapter, server_eval=server_eval)
    await _broadcast_server_eval(app_state, chapter, server_eval, pending=True)
    return StudyAnalysisRequestResult("started", server_eval, pending=True)


async def study_analysis_work_is_current(
    app_state: PychessGlobalAppState, work: FishnetWork
) -> bool:
    study_id = work.get("study_id")
    chapter_id = work.get("chapter_id")
    path = work.get("study_path")
    if not study_id or not chapter_id or path is None:
        return False
    loaded = await _load_study_and_chapter(app_state, study_id, chapter_id)
    if loaded is None:
        return False
    _, chapter = loaded
    server_eval = chapter.server_eval
    return (
        server_eval is not None
        and not server_eval.done
        and server_eval.path == path
        and chapter.root.preferred_mainline_path() == path
    )


def _merge_analysis_rows(
    chapter: StudyChapter,
    rows: list[FishnetAnalysisItem | None],
) -> tuple[tuple[AnalysisStep | None, ...], bool]:
    from fishnet import _should_save_analysis_pv

    mainline = chapter.root.preferred_mainline()
    step_count = len(mainline) + 1
    bounded = rows[:step_count]
    merged = list(chapter.server_eval.analysis if chapter.server_eval is not None else ())
    if len(merged) < step_count:
        merged.extend([None] * (step_count - len(merged)))
    elif len(merged) > step_count:
        merged = merged[:step_count]

    for i, analysis in enumerate(bounded):
        if analysis is None or "score" not in analysis:
            continue
        existing = merged[i]
        step: AnalysisStep = dict(existing) if existing is not None else {}
        step["s"] = analysis["score"]
        if "depth" in analysis:
            step["d"] = analysis["depth"]
        prev = bounded[i - 1] if i > 0 else None
        turn_color = mainline[i - 1].turn_color if i > 0 and i - 1 < len(mainline) else None
        if _should_save_analysis_pv(analysis, prev, turn_color, i):
            step["p"] = analysis["pv"]
        merged[i] = step

    complete = len(bounded) == step_count and all(row is not None for row in bounded)
    return tuple(merged), complete


async def merge_study_server_analysis(
    app_state: PychessGlobalAppState,
    work_id: str,
    work: FishnetWork,
    rows: list[FishnetAnalysisItem | None],
) -> None:
    study_id = work.get("study_id")
    chapter_id = work.get("chapter_id")
    work_path = work.get("study_path")
    if not study_id or not chapter_id or work_path is None:
        app_state.fishnet_works.pop(work_id, None)
        return

    lock = app_state.study_mutation_locks.setdefault(study_id, asyncio.Lock())
    async with lock:
        loaded = await _load_study_and_chapter(app_state, study_id, chapter_id)
        if loaded is None:
            app_state.fishnet_works.pop(work_id, None)
            return
        _, chapter = loaded
        current = chapter.server_eval
        if (
            current is None
            or current.done
            or current.path != work_path
            or chapter.root.preferred_mainline_path() != work_path
        ):
            app_state.fishnet_works.pop(work_id, None)
            return

        analysis, complete = _merge_analysis_rows(chapter, rows)
        server_eval = replace(current, done=complete, analysis=analysis)
        result = await app_state.db.study_chapter.update_one(
            {
                "_id": chapter.id,
                "studyId": chapter.study_id,
                "serverEval.path": work_path,
                "serverEval.done": False,
            },
            {"$set": {"serverEval": server_eval.to_document()}},
        )
        if result.matched_count != 1:
            app_state.fishnet_works.pop(work_id, None)
            return

        await _broadcast_server_eval(app_state, chapter, server_eval, pending=not complete)
        if complete:
            app_state.fishnet_works.pop(work_id, None)
            from catalogued_variants import clear_catalogued_variant_ai_failures

            await clear_catalogued_variant_ai_failures(app_state, str(work.get("variant") or ""))


async def fail_study_server_analysis(
    app_state: PychessGlobalAppState,
    work: FishnetWork,
    *,
    reason: str,
) -> None:
    study_id = work.get("study_id")
    chapter_id = work.get("chapter_id")
    work_path = work.get("study_path")
    if not study_id or not chapter_id or work_path is None:
        return

    lock = app_state.study_mutation_locks.setdefault(study_id, asyncio.Lock())
    async with lock:
        result = await app_state.db.study_chapter.update_one(
            {
                "_id": chapter_id,
                "studyId": study_id,
                "serverEval.path": work_path,
                "serverEval.done": False,
            },
            {"$unset": {"serverEval": ""}},
        )
        if result.matched_count == 1:
            log.info(
                "Study Fishnet analysis failed for %s/%s: %s",
                study_id,
                chapter_id,
                reason,
            )
            await _broadcast_unavailable(app_state, study_id, chapter_id, "fishnet_failed")
