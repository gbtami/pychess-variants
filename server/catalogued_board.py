from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from html import escape
import logging
from typing import Any, Mapping, TypedDict

log = logging.getLogger(__name__)


class CataloguedStartBoardPreview(TypedDict):
    svg: str
    width: int
    height: int


@dataclass(frozen=True)
class _FenPiece:
    symbol: str
    promoted: bool = False
    hidden: bool = False


BoardRows = tuple[tuple[_FenPiece | None, ...], ...]

START_BOARD_CACHE_SIZE = 512
START_BOARD_RENDERER_VERSION = 2
START_BOARD_CELL_SIZE = 24
BRICK_PIECE_SVG_URL = "/static/images/pieces/brick.svg"


def _board_part_from_fen(fen: str) -> str:
    return fen.split(maxsplit=1)[0].split("[", 1)[0]


def _empty_row(width: int) -> tuple[_FenPiece | None, ...]:
    return tuple(None for _ in range(max(0, width)))


def _parse_fen_board_rows(fen: str) -> BoardRows:
    board_part = _board_part_from_fen(fen)
    if not board_part:
        return ()

    rows: list[tuple[_FenPiece | None, ...]] = []
    for rank in board_part.split("/"):
        row: list[_FenPiece | None] = []
        i = 0
        promoted = False
        while i < len(rank):
            ch = rank[i]
            if ch.isdigit():
                j = i
                while j < len(rank) and rank[j].isdigit():
                    j += 1
                row.extend(None for _ in range(int(rank[i:j])))
                promoted = False
                i = j
                continue

            if ch == "+":
                promoted = True
                i += 1
                continue

            if ch == "~":
                if row and row[-1] is not None:
                    last = row[-1]
                    row[-1] = _FenPiece(last.symbol, last.promoted, True)
                i += 1
                continue

            row.append(_FenPiece(ch, promoted, False))
            promoted = False
            i += 1
        rows.append(tuple(row))

    return tuple(rows)


def _dimensions_from_rows(rows: BoardRows) -> tuple[int, int]:
    if not rows:
        return (0, 0)
    return max((len(row) for row in rows), default=0), len(rows)


def _piece_side(piece: _FenPiece) -> str:
    if piece.symbol.isalpha():
        return "white" if piece.symbol.isupper() else "black"
    return "neutral"


def _piece_label(piece: _FenPiece) -> str:
    if piece.hidden:
        return "?"
    label = piece.symbol.upper() if piece.symbol.isalpha() else piece.symbol
    return f"+{label}" if piece.promoted else label


def _svg_rect(x: int, y: int, size: int, klass: str) -> str:
    return (
        f'<rect class="catalogued-start-board-square {klass}" '
        f'x="{x}" y="{y}" width="{size}" height="{size}"/>'
    )


def _svg_piece(piece: _FenPiece, file_index: int, rank_index: int, cell_size: int) -> str:
    side = _piece_side(piece)
    classes = f"catalogued-start-board-piece catalogued-start-board-piece-{side}"
    if piece.promoted:
        classes += " catalogued-start-board-piece-promoted"
    if piece.hidden:
        classes += " catalogued-start-board-piece-hidden"

    if piece.symbol == "*":
        return (
            f'<image class="{classes} catalogued-start-board-piece-wall" '
            f'x="{file_index * cell_size}" y="{rank_index * cell_size}" '
            f'width="{cell_size}" height="{cell_size}" '
            f'href="{BRICK_PIECE_SVG_URL}"/>'
        )

    label = escape(_piece_label(piece))
    font_size = cell_size * (0.52 if len(label) > 1 else 0.72)
    x = file_index * cell_size + cell_size / 2
    y = rank_index * cell_size + cell_size / 2
    return (
        f'<text class="{classes}" x="{x:g}" y="{y:g}" '
        f'font-size="{font_size:g}" text-anchor="middle" dominant-baseline="central">'
        f"{label}</text>"
    )


@lru_cache(maxsize=START_BOARD_CACHE_SIZE)
def _cached_start_board_svg(
    fen: str,
    board_width: int,
    board_height: int,
    renderer_version: int,
) -> str:
    del renderer_version  # Cache-busting key for future renderer changes.

    rows = _parse_fen_board_rows(fen)
    parsed_width, parsed_height = _dimensions_from_rows(rows)
    width = board_width or parsed_width
    height = board_height or parsed_height
    if width <= 0 or height <= 0:
        return ""

    # Normalize malformed or partial rows defensively. The stored FEN should
    # already be validated by Fairy-Stockfish, but previews must not break page
    # rendering if an older document is incomplete.
    normalized_rows: list[tuple[_FenPiece | None, ...]] = []
    for rank_index in range(height):
        row = rows[rank_index] if rank_index < len(rows) else _empty_row(width)
        if len(row) < width:
            row = row + _empty_row(width - len(row))
        normalized_rows.append(row[:width])

    cell_size = START_BOARD_CELL_SIZE
    svg_width = width * cell_size
    svg_height = height * cell_size
    parts: list[str] = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'class="catalogued-start-board-svg" role="img" '
        'aria-label="Default starting position" '
        f'width="{svg_width}" height="{svg_height}" '
        f'viewBox="0 0 {svg_width} {svg_height}">',
        "<title>Default starting position</title>",
    ]

    for rank_index in range(height):
        for file_index in range(width):
            square_class = (
                "catalogued-start-board-light"
                if (rank_index + file_index) % 2 == 0
                else "catalogued-start-board-dark"
            )
            parts.append(
                _svg_rect(
                    file_index * cell_size,
                    rank_index * cell_size,
                    cell_size,
                    square_class,
                )
            )

    for rank_index, row in enumerate(normalized_rows):
        for file_index, piece in enumerate(row):
            if piece is not None:
                parts.append(_svg_piece(piece, file_index, rank_index, cell_size))

    parts.append("</svg>")
    return "".join(parts)


def catalogued_start_board_preview(doc: Mapping[str, Any]) -> CataloguedStartBoardPreview | None:
    """Return a safe inline SVG preview for a catalogued variant start FEN."""

    fen = str(doc.get("startFen") or "")
    if not fen:
        return None

    try:
        width = int(doc.get("width") or 0)
    except TypeError, ValueError:
        width = 0
    try:
        height = int(doc.get("height") or 0)
    except TypeError, ValueError:
        height = 0

    if width <= 0 or height <= 0:
        width, height = _dimensions_from_rows(_parse_fen_board_rows(fen))
    if width <= 0 or height <= 0:
        return None

    try:
        svg = _cached_start_board_svg(fen, width, height, START_BOARD_RENDERER_VERSION)
    except Exception:
        log.warning("Failed to render catalogued start board preview", exc_info=True)
        return None
    if not svg:
        return None
    return {"svg": svg, "width": width, "height": height}
