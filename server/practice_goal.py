from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

PracticeGoalResult = Literal[
    "mate",
    "mateIn",
    "drawIn",
    "equalIn",
    "evalIn",
    "promotion",
    "win",
    "winIn",
]


@dataclass(frozen=True, slots=True)
class PracticeGoal:
    """Typed objective for one open-ended computer Practice chapter.

    Result names intentionally match Lichess's Practice JSON contract for the goals
    it already supports. ``win`` and ``winIn`` are PyChess extensions for variants
    whose terminal win condition is not checkmate.
    """

    result: PracticeGoalResult
    moves: int | None = None
    cp: int | None = None

    def to_payload(self) -> dict[str, str | int]:
        payload: dict[str, str | int] = {"result": self.result}
        if self.moves is not None:
            payload["moves"] = self.moves
        if self.cp is not None:
            payload["cp"] = self.cp
        return payload


# Match lila's PracticeGoal parser, including optional ``check`` before mate and the
# compact ``300cp`` spelling. Python integers are unbounded, while Scala's toIntOption
# rejects values outside signed Int32, so apply the same range below.
_MATE_RE = re.compile(r"(?:check)?mate", re.IGNORECASE)
_MATE_IN_RE = re.compile(r"(?:check)?mate in (\d+)", re.IGNORECASE)
_DRAW_IN_RE = re.compile(r"draw in (\d+)", re.IGNORECASE)
_EQUAL_IN_RE = re.compile(r"equal(?:ize)? in (\d+)", re.IGNORECASE)
_EVAL_IN_RE = re.compile(r"([+-]?\d+)cp in (\d+)", re.IGNORECASE)
_PROMOTION_RE = re.compile(r"promotion with ([+-]?\d+)cp", re.IGNORECASE)
_WIN_RE = re.compile(r"win", re.IGNORECASE)
_WIN_IN_RE = re.compile(r"win in (\d+)", re.IGNORECASE)
_INT32_MIN = -(2**31)
_INT32_MAX = 2**31 - 1


def _int32(value: str) -> int | None:
    parsed = int(value)
    if _INT32_MIN <= parsed <= _INT32_MAX:
        return parsed
    return None


def _moves(value: str) -> int | None:
    parsed = _int32(value)
    return parsed if parsed is not None and parsed >= 0 else None


def parse_practice_goal(value: object) -> PracticeGoal | None:
    """Parse a Study ``Termination`` value into a Practice objective.

    Whitespace normalization and case-insensitive matching follow Lichess. Unlike
    Lichess, missing or unknown values do *not* default to mate: PyChess supports
    variants with non-checkmate win conditions, so curation must state the objective
    explicitly and validation can reject an ambiguous computer-practice chapter.
    """

    if not isinstance(value, str):
        return None
    normalized = " ".join(value.strip().split())
    if not normalized:
        return None

    if _MATE_RE.fullmatch(normalized):
        return PracticeGoal("mate")
    if match := _MATE_IN_RE.fullmatch(normalized):
        if (moves := _moves(match.group(1))) is not None:
            return PracticeGoal("mateIn", moves=moves)
        return None
    if match := _DRAW_IN_RE.fullmatch(normalized):
        if (moves := _moves(match.group(1))) is not None:
            return PracticeGoal("drawIn", moves=moves)
        return None
    if match := _EQUAL_IN_RE.fullmatch(normalized):
        if (moves := _moves(match.group(1))) is not None:
            return PracticeGoal("equalIn", moves=moves)
        return None
    if match := _EVAL_IN_RE.fullmatch(normalized):
        cp = _int32(match.group(1))
        moves = _moves(match.group(2))
        if cp is not None and moves is not None:
            return PracticeGoal("evalIn", moves=moves, cp=cp)
        return None
    if match := _PROMOTION_RE.fullmatch(normalized):
        if (cp := _int32(match.group(1))) is not None:
            return PracticeGoal("promotion", cp=cp)
        return None
    if _WIN_RE.fullmatch(normalized):
        return PracticeGoal("win")
    if match := _WIN_IN_RE.fullmatch(normalized):
        if (moves := _moves(match.group(1))) is not None:
            return PracticeGoal("winIn", moves=moves)
        return None
    return None
