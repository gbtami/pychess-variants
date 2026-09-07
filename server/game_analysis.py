from __future__ import annotations

"""Apply shared server advice to completed single-board games."""

import logging
from typing import TYPE_CHECKING

from analysis_advice import advice_for_move, analysis_pv, analysis_score, prepare_analysis_line
from fairy.fairy_board import FairyBoard
from typing_defs import AnalysisStep, FishnetAnalysisItem

if TYPE_CHECKING:
    from game import Game

log = logging.getLogger(__name__)


def enrich_game_analysis(
    game: Game,
    ply: int,
    previous: FishnetAnalysisItem | None,
    current: FishnetAnalysisItem,
    analysis: AnalysisStep,
) -> None:
    # Match Study/lila: no first-move advice, and only retain an alternative
    # when the engine recommends a different move and the played move gets advice.
    if ply < 2 or "advice" in analysis:
        return
    step = game.steps[ply]
    parent = game.steps[ply - 1]
    pv = analysis_pv(previous, step.get("move", ""))
    if not pv:
        return
    advice = advice_for_move(
        analysis_score(previous),
        analysis_score(current),
        previous_side_to_move=parent["turnColor"],
        current_side_to_move=step["turnColor"],
    )
    if advice is None:
        return
    try:
        needs_history = game.board.legal_moves_need_history
        board = FairyBoard(
            game.board.variant,
            initial_fen=game.board.initial_fen if needs_history else parent["fen"],
            chess960=game.chess960,
            show_promoted=game.board.show_promoted,
            legal_moves_need_history=needs_history,
        )
        if needs_history:
            for earlier in game.steps[1:ply]:
                board.push(earlier["move"])
            if board.fen != parent["fen"]:
                raise ValueError("Analysis parent reconstruction does not match stored FEN")
        variation = prepare_analysis_line(board, pv)
    except Exception:
        log.info(
            "Ignoring invalid Fishnet alternative for %s at ply %s", game.id, ply, exc_info=True
        )
        return
    analysis["advice"] = {
        "nag": advice.nag,
        "comment": advice.comment(variation[0]["san"]),
        "variation": variation,
    }
    # `p` always describes the current position in ordinary game analysis. The
    # before-move alternative lives in advice, so the PV panel/arrow remain valid.
    if current.get("pv"):
        analysis["p"] = current["pv"]


def annotated_game_moves(
    sans: list[str], initial_fen: str, analysis: list[AnalysisStep | None]
) -> str:
    """Render annotations in game PGN exports using already validated SAN lines."""
    white_starts = initial_fen.split()[1] == "w"
    parts = initial_fen.split()
    # Shogi-family FENs use their final field as the move counter too.
    move_number = int(parts[-1]) if parts[-1].isdigit() else 1
    start = 2 * (max(1, move_number) - 1) + (0 if white_starts else 1)
    tokens: list[str] = []
    for index, san in enumerate(sans):
        absolute_ply = start + index
        prefix = (
            f"{absolute_ply // 2 + 1}."
            if absolute_ply % 2 == 0
            else (f"{absolute_ply // 2 + 1}..." if index == 0 else "")
        )
        tokens.append(f"{prefix} {san}".strip())
        row = analysis[index + 1] if index + 1 < len(analysis) else None
        advice = row.get("advice") if row else None
        if advice:
            tokens.append(f"${advice['nag']}")
            comment = advice["comment"].replace("}", "\\}")
            tokens.append("{" + comment + "}")
            line: list[str] = []
            for offset, step in enumerate(advice["variation"]):
                line_ply = absolute_ply + offset
                line_prefix = (
                    f"{line_ply // 2 + 1}."
                    if line_ply % 2 == 0
                    else (f"{line_ply // 2 + 1}..." if offset == 0 else "")
                )
                line.append(f"{line_prefix} {step['sanSAN']}".strip())
            if line:
                tokens.append("(" + " ".join(line) + ")")
    return " ".join(tokens)
