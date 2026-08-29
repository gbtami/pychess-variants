from __future__ import annotations

from itertools import permutations

# https://www.chessvariants.com/rules/paradigm-chess30
# Paradigm Chess30 keeps the rooks, king, and pawns on their orthodox squares.
# The queen, two knights, and two Dragon Bishops are shuffled over b/c/d/f/g,
# yielding 5! / (2! * 2!) == 30 mirrored starting positions.
_PARADIGM_MIDDLE_PIECES = ("q", "n", "n", "b", "b")


def _back_rank(middle: tuple[str, ...]) -> str:
    return f"r{middle[0]}{middle[1]}{middle[2]}k{middle[3]}{middle[4]}r"


PARADIGM_FENS = tuple(
    f"{rank}/pppppppp/8/8/8/8/PPPPPPPP/{rank.upper()} w KQkq - 0 1"
    for rank in (
        _back_rank(middle) for middle in dict.fromkeys(permutations(_PARADIGM_MIDDLE_PIECES))
    )
)
