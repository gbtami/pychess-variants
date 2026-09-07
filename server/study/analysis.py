from __future__ import annotations

import asyncio
import logging
import math
import random
import string
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal

from bson import BSON
from catalogued_variants import catalogued_variant_allows_fishnet, replace_variant_section_name
from const import ANALYSIS
from fairy.fairy_board import NOTATION_SAN, WHITE, FairyBoard
from typing_defs import AnalysisStep, FishnetAnalysisItem, FishnetWork
from websocket_utils import ws_send_json_many

from study.annotations import StudyAnnotations, StudyComment
from study.constants import (
    STUDY_CHAPTER_MAX_BSON_BYTES,
    STUDY_MAX_COMMENTS_PER_POSITION,
    STUDY_MAX_NAGS_PER_POSITION,
    STUDY_MAX_NODES_PER_CHAPTER,
)
from study.models import Study, StudyChapter, StudyServerEval
from study.permissions import can_write_study
from study.tree import StudyTree, StudyTreeNode, new_study_node_id
from study.variant import study_variant_context

log = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pychess_global_app_state import PychessGlobalAppState

STUDY_ANALYSIS_MIN_MOVES = 5
STUDY_ANALYSIS_COOLDOWN = timedelta(minutes=5)
STUDY_ANALYSIS_NODES = 500_000
STUDY_ANALYSIS_PV_MAX_PLIES = 12
STUDY_ANALYSIS_COMMENT_AUTHOR = "PyChess"

_NAG_INACCURACY = 6
_NAG_MISTAKE = 2
_NAG_BLUNDER = 4

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
            "tree": chapter.root.to_payload(),
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
    """Persist Study analysis in the same move-oriented shape lila exposes.

    Fairyfishnet evaluates positions, so row ``i`` is the position after move ``i``
    (row 0 is the initial position).  Lila attaches the score from the *after*
    position to the played move, but its explanatory variation comes from the
    engine PV in the *before* position.  Keep that distinction here instead of
    reusing the ordinary-game PV helper, whose stored PV has different semantics.
    """

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

        # Lila has no advice for the first move because its synthetic starting
        # Info has no evaluation.  For later moves, save the best alternative
        # from the position *before* the played move only when that move is an
        # inaccuracy/mistake/blunder.
        if i >= 2:
            node = mainline[i - 1]
            previous_node = mainline[i - 2]
            previous_row = bounded[i - 1]
            pv = _analysis_pv(previous_row, node.move)
            advice = (
                _advice_for_move(
                    _analysis_score(previous_row),
                    _analysis_score(analysis),
                    previous_side_to_move=previous_node.turn_color,
                    current_side_to_move=node.turn_color,
                )
                if pv
                else None
            )
            if advice is not None:
                step["p"] = " ".join(pv)
        merged[i] = step

    complete = len(bounded) == step_count and all(row is not None for row in bounded)
    return tuple(merged), complete


@dataclass(frozen=True, slots=True)
class _StudyAdvice:
    name: str
    nag: int
    description: str


def _analysis_score(row: FishnetAnalysisItem | None) -> dict[str, int] | None:
    if row is None:
        return None
    raw = row.get("score")
    if not isinstance(raw, dict):
        return None
    score: dict[str, int] = {}
    for key in ("cp", "mate"):
        value = raw.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            score[key] = value
    return score or None


def _invert_score(score: dict[str, int]) -> dict[str, int]:
    return {key: -value for key, value in score.items()}


def _white_pov_score(score: dict[str, int], side_to_move: str) -> dict[str, int]:
    # Fairyfishnet returns the UCI score from the side-to-move point of view. Study
    # tree evaluations follow PyChess's existing raw-score convention, but advice
    # needs a stable point of view so consecutive positions can be compared.
    return score if side_to_move == "white" else _invert_score(score)


def _winning_chances_from_cp(cp: int) -> float:
    cp = max(-1000, min(1000, cp))
    return 2 / (1 + math.exp(-0.00368208 * cp)) - 1


def _advice_for_move(
    previous_score: dict[str, int] | None,
    current_score: dict[str, int] | None,
    *,
    previous_side_to_move: str,
    current_side_to_move: str,
) -> _StudyAdvice | None:
    """Mirror lila.tree.Advice for one played move.

    Lila compares White-oriented evaluations, then interprets the change from the
    mover's point of view. The first move intentionally has no advice because lila's
    synthetic Info.start has no evaluation; its variation is therefore dropped too.
    """

    if previous_score is None or current_score is None:
        return None

    previous_white = _white_pov_score(previous_score, previous_side_to_move)
    current_white = _white_pov_score(current_score, current_side_to_move)
    mover_is_white = previous_side_to_move == "white"

    previous_cp = previous_white.get("cp")
    current_cp = current_white.get("cp")
    if previous_cp is not None and current_cp is not None:
        delta = _winning_chances_from_cp(current_cp) - _winning_chances_from_cp(previous_cp)
        loss = -delta if mover_is_white else delta
        if loss >= 0.3:
            return _StudyAdvice("Blunder", _NAG_BLUNDER, "Blunder")
        if loss >= 0.2:
            return _StudyAdvice("Mistake", _NAG_MISTAKE, "Mistake")
        if loss >= 0.1:
            return _StudyAdvice("Inaccuracy", _NAG_INACCURACY, "Inaccuracy")
        return None

    previous_pov = previous_white if mover_is_white else _invert_score(previous_white)
    current_pov = current_white if mover_is_white else _invert_score(current_white)
    previous_mate = previous_pov.get("mate")
    current_mate = current_pov.get("mate")

    mate_created = (
        previous_pov.get("cp") is not None and current_mate is not None and current_mate < 0
    )
    mate_lost = (
        previous_mate is not None
        and previous_mate > 0
        and (current_pov.get("cp") is not None or (current_mate is not None and current_mate < 0))
    )
    if mate_created:
        previous_pov_cp = previous_pov.get("cp", 0)
        if previous_pov_cp < -999:
            judgment = _StudyAdvice("Inaccuracy", _NAG_INACCURACY, "Checkmate is now unavoidable")
        elif previous_pov_cp < -700:
            judgment = _StudyAdvice("Mistake", _NAG_MISTAKE, "Checkmate is now unavoidable")
        else:
            judgment = _StudyAdvice("Blunder", _NAG_BLUNDER, "Checkmate is now unavoidable")
        return judgment
    if mate_lost:
        current_pov_cp = current_pov.get("cp", 0)
        if current_pov_cp > 999:
            judgment = _StudyAdvice("Inaccuracy", _NAG_INACCURACY, "Lost forced checkmate sequence")
        elif current_pov_cp > 700:
            judgment = _StudyAdvice("Mistake", _NAG_MISTAKE, "Lost forced checkmate sequence")
        else:
            judgment = _StudyAdvice("Blunder", _NAG_BLUNDER, "Lost forced checkmate sequence")
        return judgment
    return None


def _analysis_pv(row: FishnetAnalysisItem | None, played_move: str) -> list[str]:
    if row is None:
        return []
    raw_pv = row.get("pv")
    if not isinstance(raw_pv, str):
        return []
    pv = raw_pv.split()
    if not pv or pv[0] == played_move:
        return []
    return pv[:STUDY_ANALYSIS_PV_MAX_PLIES]


def _has_generated_analysis_comment(node: StudyTreeNode) -> bool:
    return any(
        comment.author == STUDY_ANALYSIS_COMMENT_AUTHOR for comment in node.annotations.comments
    )


def _merge_advice_annotations(
    node: StudyTreeNode,
    advice: _StudyAdvice,
    best_san: str | None,
) -> StudyTreeNode:
    annotations = node.annotations
    comments = list(annotations.comments)
    nags = list(annotations.nags)

    if (
        not _has_generated_analysis_comment(node)
        and len(comments) < STUDY_MAX_COMMENTS_PER_POSITION
    ):
        text = f"{advice.description}."
        if best_san:
            text += f" {best_san} was best."
        comments.append(
            StudyComment(
                id=new_study_node_id(comment.id for comment in comments),
                author=STUDY_ANALYSIS_COMMENT_AUTHOR,
                text=text,
            )
        )

    if advice.nag not in nags and len(nags) < STUDY_MAX_NAGS_PER_POSITION:
        nags.append(advice.nag)

    merged = StudyAnnotations(
        shapes=annotations.shapes,
        comments=tuple(comments),
        nags=tuple(nags),
    )
    return replace(node, annotations=merged)


def _new_analysis_board(
    chapter: StudyChapter,
    mainline: tuple[StudyTreeNode, ...],
    *,
    parent_ply: int,
    runtime_variant: str,
    show_promoted: bool,
    legal_moves_need_history: bool,
) -> FairyBoard:
    parent = mainline[parent_ply - 1] if parent_ply else None
    parent_fen = parent.fen if parent is not None else chapter.initial_fen
    if parent is not None and not legal_moves_need_history:
        return FairyBoard(
            runtime_variant,
            initial_fen=parent_fen,
            chess960=chapter.chess960,
            show_promoted=show_promoted,
        )

    board = FairyBoard(
        runtime_variant,
        initial_fen=chapter.initial_fen,
        chess960=chapter.chess960,
        show_promoted=show_promoted,
        legal_moves_need_history=legal_moves_need_history,
    )
    for node in mainline[:parent_ply]:
        board.push(node.move)
    if parent is not None and board.fen != parent_fen:
        raise ValueError("Study analysis parent reconstruction does not match stored FEN")
    return board


def _merge_analysis_line(
    chapter: StudyChapter,
    mainline: tuple[StudyTreeNode, ...],
    nodes: dict[str, StudyTreeNode],
    children: dict[str | None, list[str]],
    *,
    parent_ply: int,
    pv: list[str],
    runtime_variant: str,
    show_promoted: bool,
    legal_moves_need_history: bool,
) -> str | None:
    """Merge one validated Fishnet best line, reusing matching Study moves.

    Lila's tree ids are move-derived, so ``addChild`` naturally merges an engine
    line with an existing human variation. PyChess Study ids are random, therefore
    matching is by UCI move below the same parent. Validate the complete PV before
    mutating the tree so a malformed later move cannot leave a half-inserted engine
    line; lila similarly drops a variation when UCI-to-SAN conversion fails.
    """

    if not pv:
        return None
    board = _new_analysis_board(
        chapter,
        mainline,
        parent_ply=parent_ply,
        runtime_variant=runtime_variant,
        show_promoted=show_promoted,
        legal_moves_need_history=legal_moves_need_history,
    )

    prepared: list[tuple[str, str, str, bool, str, str]] = []
    for move in pv:
        if move not in board.legal_moves():
            log.info(
                "Ignoring invalid Study Fishnet PV move %s for %s/%s",
                move,
                chapter.study_id,
                chapter.id,
            )
            return None
        san = board.get_san(move)
        san_san = board.sf.get_san(
            board.variant,
            board.fen,
            move,
            board.chess960,
            NOTATION_SAN,
        )
        board.push(move)
        prepared.append(
            (
                move,
                board.fen,
                "white" if board.color == WHITE else "black",
                board.is_checked(),
                san,
                san_san,
            )
        )

    # Verify the already-existing prefix first. Once a move is missing, every
    # descendant below the new random id will necessarily be new as well.
    parent_id = mainline[parent_ply - 1].id if parent_ply else None
    for move, fen, _turn_color, _check, _san, _san_san in prepared:
        sibling_ids = children.get(parent_id, [])
        existing = next(
            (nodes[node_id] for node_id in sibling_ids if nodes[node_id].move == move),
            None,
        )
        if existing is None:
            break
        if existing.fen != fen:
            log.info(
                "Ignoring Study Fishnet PV with mismatched existing node %s for %s/%s",
                existing.id,
                chapter.study_id,
                chapter.id,
            )
            return None
        parent_id = existing.id

    parent_id = mainline[parent_ply - 1].id if parent_ply else None
    for move, fen, turn_color, check, san, san_san in prepared:
        sibling_ids = children.setdefault(parent_id, [])
        existing = next(
            (nodes[node_id] for node_id in sibling_ids if nodes[node_id].move == move),
            None,
        )
        if existing is not None:
            parent_id = existing.id
            continue

        if len(nodes) >= STUDY_MAX_NODES_PER_CHAPTER:
            break
        node_id = new_study_node_id(nodes)
        node = StudyTreeNode(
            id=node_id,
            parent_id=parent_id,
            order=len(sibling_ids),
            move=move,
            fen=fen,
            turn_color=turn_color,
            check=check,
            san=san,
            san_san=san_san,
        )
        nodes[node_id] = node
        sibling_ids.append(node_id)
        children.setdefault(node_id, [])
        parent_id = node_id

    return prepared[0][4] if prepared else None


def _merge_analysis_into_tree(
    app_state: PychessGlobalAppState,
    chapter: StudyChapter,
    rows: list[FishnetAnalysisItem | None],
) -> StudyTree:
    """Apply lila-style server evaluation, advice and PV branches to a Study tree."""

    mainline = chapter.root.preferred_mainline()
    if not mainline:
        return chapter.root

    nodes = dict(chapter.root.nodes)
    children: dict[str | None, list[str]] = {None: []}
    for node in nodes.values():
        children.setdefault(node.parent_id, []).append(node.id)
        children.setdefault(node.id, [])
    for sibling_ids in children.values():
        sibling_ids.sort(key=lambda node_id: nodes[node_id].order)

    try:
        with study_variant_context(app_state, chapter.variant, chapter.variant_ini) as options:
            for ply, mainline_node in enumerate(mainline, start=1):
                current_score = _analysis_score(rows[ply] if ply < len(rows) else None)
                previous_row = rows[ply - 1] if ply - 1 < len(rows) else None
                current = nodes[mainline_node.id]
                previous_side_to_move = mainline[ply - 2].turn_color if ply >= 2 else None

                # Lila keeps a best-line variation only when the played move receives
                # advice. Its first move has no advice because Info.start has no eval,
                # and UciToSan drops all other non-meaningful variations before the
                # Study merger sees them.
                pv = _analysis_pv(previous_row, mainline_node.move)
                advice: _StudyAdvice | None = None
                if pv and previous_side_to_move is not None:
                    advice = _advice_for_move(
                        _analysis_score(previous_row),
                        current_score,
                        previous_side_to_move=previous_side_to_move,
                        current_side_to_move=current.turn_color,
                    )

                best_san: str | None = None
                if advice is not None:
                    try:
                        best_san = _merge_analysis_line(
                            chapter,
                            mainline,
                            nodes,
                            children,
                            parent_ply=ply - 1,
                            pv=pv,
                            runtime_variant=options.runtime_variant,
                            show_promoted=options.show_promoted,
                            legal_moves_need_history=options.legal_moves_need_history,
                        )
                    except Exception:
                        log.info(
                            "Study Fishnet PV conversion failed for %s/%s at ply %s",
                            chapter.study_id,
                            chapter.id,
                            ply,
                            exc_info=True,
                        )
                        advice = None
                    if best_san is None:
                        advice = None

                had_generated_comment = _has_generated_analysis_comment(current)
                if current_score is not None and (
                    current.eval_score is None or (advice is not None and not had_generated_comment)
                ):
                    current = replace(current, eval_score=current_score)
                if advice is not None:
                    current = _merge_advice_annotations(current, advice, best_san)
                nodes[current.id] = current
    except Exception:
        log.info(
            "Study Fishnet tree merge setup failed for %s/%s (%s)",
            chapter.study_id,
            chapter.id,
            chapter.variant,
            exc_info=True,
        )
        return chapter.root

    return StudyTree(nodes, root_annotations=chapter.root.root_annotations)


def _tree_within_chapter_size(
    chapter: StudyChapter,
    root: StudyTree,
    server_eval: StudyServerEval,
) -> bool:
    if root == chapter.root:
        return True
    try:
        candidate = replace(chapter, root=root, server_eval=server_eval)
        return len(BSON.encode(candidate.to_document())) <= STUDY_CHAPTER_MAX_BSON_BYTES
    except Exception:
        log.exception(
            "Failed to size Study Fishnet tree merge for %s/%s",
            chapter.study_id,
            chapter.id,
        )
        return False


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
        merged_root = _merge_analysis_into_tree(app_state, chapter, rows)
        if not _tree_within_chapter_size(chapter, merged_root, server_eval):
            log.warning(
                "Skipping Study Fishnet tree merge for %s/%s because the chapter size limit would be exceeded",
                chapter.study_id,
                chapter.id,
            )
            merged_root = chapter.root

        set_fields: dict[str, object] = {"serverEval": server_eval.to_document()}
        if merged_root != chapter.root:
            set_fields["root"] = merged_root.to_document()
        result = await app_state.db.study_chapter.update_one(
            {
                "_id": chapter.id,
                "studyId": chapter.study_id,
                "serverEval.path": work_path,
                "serverEval.done": False,
            },
            {"$set": set_fields},
        )
        if result.matched_count != 1:
            app_state.fishnet_works.pop(work_id, None)
            return

        chapter = replace(chapter, root=merged_root, server_eval=server_eval)
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
