from __future__ import annotations

"""Shared Fishnet advice for single-board games and Study chapters.

Adapted from lichess-org/lila modules/tree/src/main/Advice.scala.
Worker scores remain side-to-move oriented; comparisons normalize their POV.
"""

import math
from dataclasses import dataclass

from fairy.fairy_board import NOTATION_SAN, WHITE, FairyBoard
from typing_defs import AnalysisVariationStep, FishnetAnalysisItem

ANALYSIS_PV_MAX_PLIES = 12
ANALYSIS_COMMENT_AUTHOR = "PyChess"
_NAG_INACCURACY = 6
_NAG_MISTAKE = 2
_NAG_BLUNDER = 4


@dataclass(frozen=True, slots=True)
class MoveAdvice:
    name: str
    nag: int
    description: str

    def comment(self, best_san: str | None) -> str:
        return f"{self.description}." + (f" {best_san} was best." if best_san else "")


def analysis_score(row: FishnetAnalysisItem | None) -> dict[str, int] | None:
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


def advice_for_move(
    previous_score: dict[str, int] | None,
    current_score: dict[str, int] | None,
    *,
    previous_side_to_move: str,
    current_side_to_move: str,
) -> MoveAdvice | None:
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
            return MoveAdvice("Blunder", _NAG_BLUNDER, "Blunder")
        if loss >= 0.2:
            return MoveAdvice("Mistake", _NAG_MISTAKE, "Mistake")
        if loss >= 0.1:
            return MoveAdvice("Inaccuracy", _NAG_INACCURACY, "Inaccuracy")
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
            judgment = MoveAdvice("Inaccuracy", _NAG_INACCURACY, "Checkmate is now unavoidable")
        elif previous_pov_cp < -700:
            judgment = MoveAdvice("Mistake", _NAG_MISTAKE, "Checkmate is now unavoidable")
        else:
            judgment = MoveAdvice("Blunder", _NAG_BLUNDER, "Checkmate is now unavoidable")
        return judgment
    if mate_lost:
        current_pov_cp = current_pov.get("cp", 0)
        if current_pov_cp > 999:
            judgment = MoveAdvice("Inaccuracy", _NAG_INACCURACY, "Lost forced checkmate sequence")
        elif current_pov_cp > 700:
            judgment = MoveAdvice("Mistake", _NAG_MISTAKE, "Lost forced checkmate sequence")
        else:
            judgment = MoveAdvice("Blunder", _NAG_BLUNDER, "Lost forced checkmate sequence")
        return judgment
    return None


def analysis_pv(row: FishnetAnalysisItem | None, played_move: str) -> list[str]:
    if row is None:
        return []
    raw_pv = row.get("pv")
    if not isinstance(raw_pv, str):
        return []
    pv = raw_pv.split()
    if not pv or pv[0] == played_move:
        return []
    return pv[:ANALYSIS_PV_MAX_PLIES]


def prepare_analysis_line(board: FairyBoard, pv: list[str]) -> list[AnalysisVariationStep]:
    """Validate the whole line before either consumer changes its tree."""
    prepared: list[AnalysisVariationStep] = []
    for move in pv:
        if move not in board.legal_moves():
            raise ValueError(f"Invalid Fishnet PV move: {move}")
        san = board.get_san(move)
        san_san = board.sf.get_san(board.variant, board.fen, move, board.chess960, NOTATION_SAN)
        board.push(move)
        prepared.append(
            {
                "move": move,
                "fen": board.fen,
                "turnColor": "white" if board.color == WHITE else "black",
                "check": board.is_checked(),
                "san": san,
                "sanSAN": san_san,
            }
        )
    return prepared
