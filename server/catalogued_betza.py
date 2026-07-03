from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache
import logging
from typing import Any, Mapping, NamedTuple, TypedDict

from betza_visualizer import BetzaSvgOptions, render_betza_svg

log = logging.getLogger(__name__)


class CataloguedBetzaDiagram(TypedDict):
    piece: str
    betza: str
    title: str
    svg: str


class _CustomPieceDefinition(NamedTuple):
    option: str
    piece: str
    betza: str


MAX_CATALOGUED_BETZA_DIAGRAMS = 26  # 25 customPiece slots + optional custom king.
BETZA_DIAGRAM_CACHE_SIZE = 512
BETZA_DIAGRAM_RENDERER_VERSION = 1


def _strip_inline_comment(line: str) -> str:
    # Fairy-Stockfish examples use # for comments and not inside option values.
    return line.split("#", 1)[0].strip()


def _iter_ini_options(ini: str) -> Iterator[tuple[str, str]]:
    """Yield option/value pairs from the first parsed Fairy-Stockfish variant section."""

    inside_section = False
    for raw_line in ini.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and "]" in line:
            if inside_section:
                break
            inside_section = True
            continue
        if not inside_section or "=" not in line:
            continue

        key, value = _strip_inline_comment(line).split("=", 1)
        key = key.strip()
        value = value.strip()
        if key:
            yield key, value


def _custom_piece_sort_key(option: str) -> tuple[int, int]:
    lowered = option.casefold()
    if lowered == "king":
        return (1, 0)
    suffix = lowered.removeprefix("custompiece")
    return (0, int(suffix) if suffix.isdigit() else 0)


def _custom_piece_definitions(ini: str) -> list[_CustomPieceDefinition]:
    definitions: list[_CustomPieceDefinition] = []

    for key, value in _iter_ini_options(ini):
        lowered = key.casefold()
        if lowered != "king" and not lowered.startswith("custompiece"):
            continue
        if value == "-":
            continue

        piece, separator, betza = value.partition(":")
        piece = piece.strip()
        betza = betza.strip()

        # A bare king definition, e.g. "king = k", means the normal king move.
        # It does not need a custom Betza diagram.
        if lowered == "king" and not separator:
            continue
        if not separator or not betza:
            continue
        if len(piece) != 1 or not piece.isalpha():
            continue

        definitions.append(_CustomPieceDefinition(option=key, piece=piece.lower(), betza=betza))

    definitions.sort(key=lambda item: _custom_piece_sort_key(item.option))
    return definitions[:MAX_CATALOGUED_BETZA_DIAGRAMS]


def _preview_dimension(value: object, *, fallback: int = 11) -> int:
    if value is None or value == "":
        dimension = fallback
    elif isinstance(value, int):
        dimension = value
    elif isinstance(value, (float, str)):
        try:
            dimension = int(value)
        except ValueError:
            dimension = fallback
    else:
        dimension = fallback
    return min(11, max(5, dimension))


def _piece_title(definition: _CustomPieceDefinition) -> str:
    if definition.option.casefold() == "king":
        return f"Custom king ({definition.piece.upper()})"
    suffix = definition.option.casefold().removeprefix("custompiece")
    if suffix.isdigit():
        return f"Custom piece {suffix} ({definition.piece.upper()})"
    return f"Custom piece {definition.piece.upper()}"


@lru_cache(maxsize=1024)
def _cached_betza_svg(
    betza: str,
    piece_label: str,
    title: str,
    board_width: int,
    board_height: int,
    renderer_version: int,
) -> str:
    del renderer_version  # Cache-busting key for future renderer changes.
    options = BetzaSvgOptions(
        board_width=board_width,
        board_height=board_height,
        cell_size=22,
        piece_label=piece_label,
        css_class="catalogued-betza-svg",
        title=title,
    )
    return render_betza_svg(betza, options)


@lru_cache(maxsize=BETZA_DIAGRAM_CACHE_SIZE)
def _cached_catalogued_betza_diagrams(
    ini: str,
    board_width: int,
    board_height: int,
    renderer_version: int,
) -> tuple[CataloguedBetzaDiagram, ...]:
    del renderer_version  # Cache-busting key for future diagram wording/layout changes.
    diagrams: list[CataloguedBetzaDiagram] = []

    for definition in _custom_piece_definitions(ini):
        title = f"{_piece_title(definition)} movement"
        try:
            svg = _cached_betza_svg(
                definition.betza,
                definition.piece.upper(),
                title,
                board_width,
                board_height,
                BETZA_DIAGRAM_RENDERER_VERSION,
            )
        except Exception:
            log.warning(
                "Failed to render Betza diagram for %s (%s)",
                definition.option,
                definition.betza,
                exc_info=True,
            )
            continue
        if not svg:
            continue
        diagrams.append(
            {
                "piece": definition.piece,
                "betza": definition.betza,
                "title": title,
                "svg": svg,
            }
        )

    return tuple(diagrams)


def catalogued_betza_diagrams(doc: Mapping[str, Any]) -> list[CataloguedBetzaDiagram]:
    """Return inline SVG movement diagrams for custom Betza pieces in a variant doc."""

    ini = str(doc.get("ini") or "")
    board_width = _preview_dimension(doc.get("width"))
    board_height = _preview_dimension(doc.get("height"))
    return list(
        _cached_catalogued_betza_diagrams(
            ini,
            board_width,
            board_height,
            BETZA_DIAGRAM_RENDERER_VERSION,
        )
    )
