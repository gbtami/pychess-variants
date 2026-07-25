from __future__ import annotations

from fairy.cwda import CWDA_START_FENS
from variants import get_server_variant

# Keep these curated FENs in sync with the client-side canRated flags in
# client/variants.ts. Any non-empty FEN not listed here fails the position-level
# rating check even when its variant otherwise supports ratings.
CHESS_NO_CASTLE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"
CRAZYHOUSE_NO_CASTLE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w - - 0 1"

# These values intentionally duplicate server/fairy/capa_altarnate.py. Importing that
# module here would initialize the Fairy-Stockfish bindings in lightweight Seek paths.
CAPABLANCA_RATED_START_FENS = (
    "rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1",
    "ranbqkbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR w KQkq - 0 1",
    "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1",
    "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",
    "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",
    "rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR w KQkq - 0 1",
    "rbncqkanbr/pppppppppp/10/10/10/10/PPPPPPPPPP/RBNCQKANBR w KQkq - 0 1",
    "crnbakbnrq/pppppppppp/10/10/10/10/PPPPPPPPPP/CRNBAKBNRQ w KQkq - 0 1",
)


def _house(fen: str) -> str:
    return fen.replace(" w", "[] w")


RATED_CUSTOM_START_FENS: dict[str, frozenset[str]] = {
    "chess": frozenset((CHESS_NO_CASTLE_FEN,)),
    "crazyhouse": frozenset((CRAZYHOUSE_NO_CASTLE_FEN,)),
    "capablanca": frozenset(CAPABLANCA_RATED_START_FENS),
    "capahouse": frozenset(_house(fen) for fen in CAPABLANCA_RATED_START_FENS),
    "cwda": frozenset(CWDA_START_FENS),
}


def normalize_start_fen(fen: str | None) -> str:
    return "" if fen is None else " ".join(fen.split())


def can_rate_custom_start(variant: str, fen: str | None, chess960: bool = False) -> bool:
    """Return whether a non-default predefined start may share the variant rating pool."""

    normalized_fen = normalize_start_fen(fen)
    if not normalized_fen:
        return True
    if chess960:
        return False
    return normalized_fen in RATED_CUSTOM_START_FENS.get(variant, ())


def can_rate_variant(variant: str, chess960: bool = False) -> bool:
    """Return whether the site maintains ratings for this variant."""

    try:
        return get_server_variant(variant, chess960).rating_enabled
    except KeyError:
        return False


def can_rate_start(
    variant: str,
    fen: str | None,
    chess960: bool = False,
    *,
    is_rematch: bool = False,
) -> bool:
    """Return whether a newly created game may be rated."""

    return can_rate_variant(variant, chess960) and (
        is_rematch or can_rate_custom_start(variant, fen, chess960)
    )
