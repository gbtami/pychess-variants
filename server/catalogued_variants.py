from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, NamedTuple, NotRequired, TypedDict
from urllib.parse import unquote

import aiohttp_session
from aiohttp import web
from pymongo.errors import DuplicateKeyError

from compress import MAX_COMPRESSED_BOARD_HEIGHT, MAX_COMPRESSED_BOARD_WIDTH
from const import ANON_PREFIX
from fairy.fairy_board import sf
from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from catalogued_betza import catalogued_betza_diagrams
from catalogued_rules import catalogued_rule_summary
from request_utils import read_json_data, read_post_data, read_text_data
from settings import ADMINS
from variants import (
    CATALOGUED_VARIANTS,
    ServerVariants,
    is_catalogued_variant,
    register_catalogued_server_variant,
    unregister_catalogued_server_variant,
)

log = logging.getLogger(__name__)

CATALOGUED_VARIANT_COLLECTION = "catalogued_variant"
CATALOGUED_CATEGORY = "other"
CATALOGUED_ICON = "◇"
CATALOGUED_VISIBILITY_PRIVATE = "private"
CATALOGUED_VISIBILITY_UNLISTED = "unlisted"
CATALOGUED_VISIBILITY_PUBLIC = "public"
CATALOGUED_VISIBILITIES = frozenset(
    {CATALOGUED_VISIBILITY_PRIVATE, CATALOGUED_VISIBILITY_UNLISTED, CATALOGUED_VISIBILITY_PUBLIC}
)
CATALOGUED_COMMUNITY_PAGE_SIZE = 20
MAX_CATALOGUED_VARIANTS_PER_USER = 20

MAX_CATALOGUED_PIECE_SET_TOTAL_BYTES = 256 * 1024
MAX_CATALOGUED_PIECE_SVG_BYTES = 32 * 1024

MAX_CATALOGUED_INI_BYTES = 64 * 1024
MAX_DESCRIPTION_LEN = 1000
MAX_DISPLAY_NAME_LEN = 80

VARIANT_NAME_ERROR = (
    "Variant names must be 3-32 chars, start with a lowercase letter, "
    "and contain only lowercase letters, digits, hyphens, and underscores."
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FSF_CHECK_TIMEOUT_SECONDS = 8.0
BUILTIN_VARIANT_NAMES = frozenset(variant.server_name for variant in ServerVariants)
BUILTIN_FSF_VARIANT_NAMES = frozenset(sf.variants())


class VariantSectionMatch(NamedTuple):
    start: int
    end: int
    name: str
    suffix: str


class CataloguedVariantPieceSetSvg(TypedDict):
    svg: str
    size: int


class CataloguedVariantDocument(TypedDict):
    _id: str
    name: str
    displayName: str
    description: str
    author: str
    ini: str
    enabled: bool
    archived: bool
    startFen: str
    width: int
    height: int
    pieces: list[str]
    kingRoles: list[str]
    pocketRoles: list[str]
    captureToHand: bool
    promotionRoles: list[str]
    icon: str
    category: str
    visibility: str
    pieceSet: NotRequired[dict[str, CataloguedVariantPieceSetSvg]]
    pieceSetUpdatedAt: NotRequired[datetime]
    createdAt: datetime
    updatedAt: datetime


class CataloguedVariantClientDocument(TypedDict):
    name: str
    displayName: str
    tooltip: str
    ini: str
    startFen: str
    width: int
    height: int
    pieces: list[str]
    kingRoles: list[str]
    pocketRoles: list[str]
    captureToHand: bool
    promotionRoles: list[str]
    icon: str
    category: str
    author: NotRequired[str]
    archived: NotRequired[bool]
    enabled: NotRequired[bool]
    gameCount: NotRequired[int]
    locked: NotRequired[bool]
    visibility: NotRequired[str]
    hasPieceSet: NotRequired[bool]
    pieceSetRevision: NotRequired[str]


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _is_active_catalogued_doc(doc: Mapping[str, Any]) -> bool:
    return bool(doc.get("enabled", True)) and not bool(doc.get("archived", False))


def _catalogued_visibility(doc: Mapping[str, Any]) -> str:
    visibility = str(doc.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE).strip().lower()
    return visibility if visibility in CATALOGUED_VISIBILITIES else CATALOGUED_VISIBILITY_PRIVATE


def _clean_visibility(visibility: str | None) -> str:
    cleaned = str(visibility or CATALOGUED_VISIBILITY_PRIVATE).strip().lower()
    if cleaned not in CATALOGUED_VISIBILITIES:
        raise web.HTTPBadRequest(text="Variant visibility must be private, unlisted, or public.")
    return cleaned


def _can_preload_catalogued_doc(username: str | None, doc: Mapping[str, Any]) -> bool:
    if not _is_active_catalogued_doc(doc):
        return False
    if _catalogued_visibility(doc) == CATALOGUED_VISIBILITY_PUBLIC:
        return True
    if not username:
        return False
    return doc.get("author") == username or _is_admin_username(username)


def _can_open_catalogued_doc(username: str | None, doc: Mapping[str, Any]) -> bool:
    if not _is_active_catalogued_doc(doc):
        return False
    if _catalogued_visibility(doc) in {
        CATALOGUED_VISIBILITY_PUBLIC,
        CATALOGUED_VISIBILITY_UNLISTED,
    }:
        return True
    if not username:
        return False
    return doc.get("author") == username or _is_admin_username(username)


def _catalogued_public_query() -> dict[str, Any]:
    return {
        "enabled": {"$ne": False},
        "archived": {"$ne": True},
        "visibility": CATALOGUED_VISIBILITY_PUBLIC,
    }


def _ensure_catalogued_dimensions_supported(width: int, height: int) -> None:
    if width > MAX_COMPRESSED_BOARD_WIDTH:
        raise web.HTTPBadRequest(
            text=(
                "This board is too wide for the current saved-game move codec. "
                f"User-defined variants can have at most {MAX_COMPRESSED_BOARD_WIDTH} files."
            )
        )
    if height > MAX_COMPRESSED_BOARD_HEIGHT:
        raise web.HTTPBadRequest(
            text=(
                "This board is too tall for the current saved-game move codec. "
                f"User-defined variants can have at most {MAX_COMPRESSED_BOARD_HEIGHT} ranks."
            )
        )


def _catalogued_grand_from_dimensions(width: int, height: int) -> bool:
    """Return whether moves can use the old fast 10-rank Grand codec."""

    _ensure_catalogued_dimensions_supported(width, height)
    return height == 10


def _catalogued_extended_move_codec_from_dimensions(width: int, height: int) -> bool:
    """Return whether moves need the slower variable-rank codec.

    Variants up to 10 ranks keep the old standard codec plus optional
    grand2zero()/zero2grand() normalization. Only 11..16-rank user-defined
    variants use the extended parser/codec.
    """

    _ensure_catalogued_dimensions_supported(width, height)
    return height > 10


def _is_valid_variant_name(name: str) -> bool:
    if not 3 <= len(name) <= 32:
        return False
    if not "a" <= name[0] <= "z":
        return False
    return all(("a" <= ch <= "z") or ch.isdigit() or ch in {"-", "_"} for ch in name)


def _ensure_catalogued_ini_size(ini: str) -> None:
    if len(ini.encode("utf-8")) > MAX_CATALOGUED_INI_BYTES:
        raise web.HTTPBadRequest(text="The INI file is too large.")


def _catalogued_variant_section_matches(ini: str) -> list[VariantSectionMatch]:
    """Return simple top-level INI section headers without using regex.

    The uploaded text is user controlled, so parsing line-by-line avoids the
    CodeQL ReDoS warning around multiline regex scanning. The caller still
    validates the extracted section name with the stricter site rule.
    """
    _ensure_catalogued_ini_size(ini)

    matches: list[VariantSectionMatch] = []
    offset = 0

    for line in ini.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            left = line.index("[")
            right = line.rindex("]")
            body = line[left + 1 : right]
            name_part, separator, suffix_part = body.partition(":")
            name = name_part.strip()

            if name:
                suffix = f":{suffix_part.strip()}" if separator else ""
                matches.append(
                    VariantSectionMatch(
                        start=offset + left,
                        end=offset + right + 1,
                        name=name,
                        suffix=suffix,
                    )
                )

        offset += len(line)

    return matches


def extract_variant_name(ini: str) -> str:
    sections = [match.name for match in _catalogued_variant_section_matches(ini)]
    if len(sections) != 1:
        raise web.HTTPBadRequest(text="The INI must contain exactly one variant section.")

    name = sections[0]
    if not _is_valid_variant_name(name):
        raise web.HTTPBadRequest(text=VARIANT_NAME_ERROR)

    return name


def replace_variant_section_name(ini: str, new_name: str) -> str:
    if not _is_valid_variant_name(new_name):
        raise web.HTTPBadRequest(text=VARIANT_NAME_ERROR)

    matches = _catalogued_variant_section_matches(ini)
    if len(matches) != 1:
        raise web.HTTPBadRequest(text="The INI must contain exactly one variant section.")

    match = matches[0]
    return ini[: match.start] + f"[{new_name}{match.suffix}]" + ini[match.end :]


def _one_line_log_text(text: str, limit: int = 500) -> str:
    collapsed = " ".join(text.replace("\x00", "\ufffd").split())
    if len(collapsed) > limit:
        return collapsed[:limit] + "…"
    return collapsed


def _board_part_from_fen(fen: str) -> str:
    return fen.split(maxsplit=1)[0]


def _iter_fen_piece_letters(board_part: str):
    for ch in board_part:
        if ch == "[":
            continue
        if ch == "]":
            continue
        if ch in "/~":
            continue
        if ch == "+":
            continue
        if ch.isalpha():
            # In FSF FEN a promoted piece is written as +P. The piece role used
            # by the UI is still the base letter; the promotion marker is not a square.
            yield ch.lower()
            continue
        if ch.isdigit():
            continue


def board_dimensions_from_fen(fen: str) -> tuple[int, int]:
    board_part = _board_part_from_fen(fen).split("[", 1)[0]
    ranks = board_part.split("/")
    widths: list[int] = []

    for rank in ranks:
        width = 0
        i = 0
        while i < len(rank):
            ch = rank[i]
            if ch.isdigit():
                j = i
                while j < len(rank) and rank[j].isdigit():
                    j += 1
                width += int(rank[i:j])
                i = j
                continue
            if ch == "+":
                i += 1
                continue
            if ch in "~":
                i += 1
                continue
            width += 1
            i += 1
        widths.append(width)

    if not widths or any(width != widths[0] for width in widths):
        raise web.HTTPBadRequest(text="The variant start FEN has inconsistent board rank widths.")

    return widths[0], len(ranks)


def piece_letters_from_fen(fen: str) -> list[str]:
    seen: set[str] = set()
    pieces: list[str] = []

    for letter in _iter_fen_piece_letters(_board_part_from_fen(fen)):
        if letter not in seen:
            seen.add(letter)
            pieces.append(letter)

    if not pieces:
        pieces = ["k"]

    # Keep common king/pawn/power pieces early in the editor row when present,
    # then append any fantasy letters in their first-seen order.
    preferred = [letter for letter in "kqrbnpacefwhm" if letter in seen]
    return preferred + [letter for letter in pieces if letter not in preferred]


def _ini_option(ini: str, key: str) -> str | None:
    wanted = key.casefold()

    for line in ini.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        left, right = stripped.split("=", 1)
        if left.strip().casefold() == wanted:
            return right.split("#", 1)[0].strip()

    return None


def _ini_bool(ini: str, key: str, default: bool = False) -> bool:
    value = _ini_option(ini, key)
    if value is None:
        return default
    return value.casefold() in {"true", "yes", "1", "on"}


def _ini_piece_letters(ini: str, key: str) -> list[str]:
    value = _ini_option(ini, key) or ""
    seen: set[str] = set()
    letters: list[str] = []
    for ch in value:
        if ch.isalpha() and ch.lower() not in seen:
            seen.add(ch.lower())
            letters.append(ch.lower())
    return letters


def _merge_piece_letters(first: list[str], second: list[str]) -> list[str]:
    merged = list(first)
    seen = set(merged)
    for letter in second:
        if letter not in seen:
            seen.add(letter)
            merged.append(letter)
    return merged


def pocket_letters_from_fen(fen: str) -> list[str]:
    board_part = _board_part_from_fen(fen)
    if "[" not in board_part or "]" not in board_part:
        return []

    pocket = board_part.split("[", 1)[1].split("]", 1)[0]
    seen: set[str] = set()
    letters: list[str] = []

    for ch in pocket:
        if ch.isalpha() and ch.lower() not in seen:
            seen.add(ch.lower())
            letters.append(ch.lower())

    return letters


def catalogued_pocket_roles(ini: str, start_fen: str, pieces: list[str]) -> list[str]:
    if not _ini_bool(ini, "pieceDrops") and "[" not in _board_part_from_fen(start_fen):
        return []
    pocket_letters = pocket_letters_from_fen(start_fen)
    return pocket_letters or pieces


def catalogued_promotion_roles(ini: str, pieces: list[str]) -> list[str]:
    promoted_piece_type = _ini_option(ini, "promotedPieceType") or ""
    roles: list[str] = []
    seen: set[str] = set()

    for token in promoted_piece_type.split():
        source = token.split(":", 1)[0].strip().lower()
        if len(source) == 1 and source.isalpha() and source not in seen:
            seen.add(source)
            roles.append(source)

    if roles:
        return roles

    if _ini_bool(ini, "mandatoryPawnPromotion") and "p" in pieces:
        return ["p"]

    return []


PIECE_SET_FILENAME_RE = re.compile(r"^([wb])(\+?)([A-Za-z])\.svg$")
XML_DECL_RE = re.compile(r"^\ufeff?\s*<\?xml\s+[^?]*\?>", re.IGNORECASE)
XML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
SAFE_SVG_TAGS = frozenset(
    {
        "svg",
        "g",
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "title",
        "desc",
    }
)
SAFE_SVG_ATTRS = frozenset(
    {
        "xmlns",
        "version",
        "viewBox",
        "width",
        "height",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "d",
        "points",
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "fill-rule",
        "clip-rule",
        "opacity",
        "fill-opacity",
        "stroke-opacity",
        "transform",
        "transform-origin",
        "aria-label",
        "role",
    }
)
SAFE_SVG_STYLE_ATTRS = frozenset(
    {
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "fill-rule",
        "clip-rule",
        "opacity",
        "fill-opacity",
        "stroke-opacity",
        "transform",
        "transform-origin",
    }
)
SAFE_SVG_VALUE_RE = re.compile(r"^[#%,.0-9A-Za-z_() +\-/:]*$")


def _local_xml_name(name: str) -> str:
    if "}" in name:
        return name.rsplit("}", 1)[1]
    return name


def _svg_value_is_unsafe(value: str) -> bool:
    lowered = value.casefold()
    return "url(" in lowered or "javascript:" in lowered or "data:" in lowered


def _parse_safe_svg_style(style: str, filename: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for chunk in style.split(";"):
        declaration = chunk.strip()
        if not declaration:
            continue
        name, separator, value = declaration.partition(":")
        if not separator:
            raise web.HTTPBadRequest(text=f"{filename} contains malformed SVG style declarations.")
        prop = name.strip().casefold()
        cleaned_value = value.strip()
        if _svg_value_is_unsafe(cleaned_value):
            raise web.HTTPBadRequest(text=f"{filename} contains unsafe SVG attribute values.")
        if not SAFE_SVG_VALUE_RE.fullmatch(cleaned_value):
            raise web.HTTPBadRequest(text=f"{filename} contains unsupported SVG attribute values.")
        if prop in SAFE_SVG_STYLE_ATTRS:
            parsed[prop] = cleaned_value
    return parsed


def _prune_unsupported_svg_children(element: ET.Element) -> None:
    for child in list(element):
        if not isinstance(child.tag, str):
            element.remove(child)
            continue
        tag = _local_xml_name(child.tag)
        if tag not in SAFE_SVG_TAGS:
            element.remove(child)
            continue
        child.tag = tag
        _prune_unsupported_svg_children(child)


def _canonical_piece_set_filename(filename: str) -> str | None:
    filename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    filename = unquote(filename)
    filename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    match = PIECE_SET_FILENAME_RE.fullmatch(filename)
    if match is None:
        return None
    color, promoted, letter = match.groups()
    return f"{color}{promoted}{letter.upper()}.svg"


def _catalogued_piece_set_required_filenames(doc: Mapping[str, Any]) -> list[str]:
    roles = {str(role).lower() for role in doc.get("pieces", []) if str(role).isalpha()}
    promoted_roles = {
        str(role).lower() for role in doc.get("promotionRoles", []) if str(role).isalpha()
    }
    filenames: list[str] = []
    for color in ("w", "b"):
        for role in sorted(roles):
            filenames.append(f"{color}{role.upper()}.svg")
        for role in sorted(promoted_roles):
            filenames.append(f"{color}+{role.upper()}.svg")
    return filenames


def _catalogued_piece_set_required_filenames_text(doc: Mapping[str, Any]) -> str:
    return ", ".join(_catalogued_piece_set_required_filenames(doc))


def _catalogued_piece_set_storage_key(filename_or_key: str) -> str:
    # MongoDB field names with dots are awkward and can fail on older server /
    # driver combinations. Store wP.svg as wP and w+P.svg as w+P, but accept
    # the old dotted keys when reading in case any test data was already saved.
    key = filename_or_key
    if key.endswith(".svg"):
        key = key[:-4]
    return key


def _catalogued_piece_set_required_keys(doc: Mapping[str, Any]) -> set[str]:
    return {
        _catalogued_piece_set_storage_key(filename)
        for filename in _catalogued_piece_set_required_filenames(doc)
    }


def _catalogued_piece_set_public_filename(key: str) -> str:
    return key if key.endswith(".svg") else f"{key}.svg"


def _piece_set_revision(doc: Mapping[str, Any]) -> str:
    updated_at = doc.get("pieceSetUpdatedAt")
    if isinstance(updated_at, datetime):
        return str(int(updated_at.timestamp()))
    return re.sub(r"\W+", "", str(updated_at or "0")) or "0"


def _sanitize_catalogued_piece_svg(raw: bytes, filename: str) -> str:
    if not raw:
        raise web.HTTPBadRequest(text=f"{filename} is empty.")
    if len(raw) > MAX_CATALOGUED_PIECE_SVG_BYTES:
        raise web.HTTPBadRequest(
            text=(
                f"{filename} is too large. Each SVG must be at most "
                f"{MAX_CATALOGUED_PIECE_SVG_BYTES // 1024} KiB."
            )
        )

    text = raw.decode("utf-8", errors="strict").strip()
    xml_decl = XML_DECL_RE.match(text)
    if xml_decl is not None:
        text = text[xml_decl.end() :].lstrip()
    text = XML_COMMENT_RE.sub("", text)
    lowered = text.casefold()
    if "<!" in text or "<?" in text:
        raise web.HTTPBadRequest(
            text=f"{filename} contains unsupported doctypes or processing instructions."
        )
    if any(token in lowered for token in ("<script", "foreignobject", "javascript:", "data:")):
        raise web.HTTPBadRequest(text=f"{filename} contains unsafe SVG content.")

    try:
        root = ET.fromstring(text)
    except (ET.ParseError, UnicodeDecodeError) as exc:
        raise web.HTTPBadRequest(text=f"{filename} is not a valid UTF-8 SVG file.") from exc

    if _local_xml_name(root.tag) != "svg":
        raise web.HTTPBadRequest(text=f"{filename} must contain one <svg> root element.")

    root.tag = "svg"
    _prune_unsupported_svg_children(root)

    for element in root.iter():
        if not isinstance(element.tag, str):
            raise web.HTTPBadRequest(text=f"{filename} contains unsupported SVG nodes.")
        if element.tag not in SAFE_SVG_TAGS:
            raise web.HTTPBadRequest(
                text=f"{filename} contains unsupported <{element.tag}> SVG elements."
            )

        clean_attrs: dict[str, str] = {}
        for attr, raw_value in list(element.attrib.items()):
            local_attr = _local_xml_name(attr)
            value = raw_value.strip()
            if local_attr == "style":
                clean_attrs.update(_parse_safe_svg_style(value, filename))
                continue
            if local_attr.startswith("on"):
                continue
            if local_attr in {"href", "src", "class", "id"}:
                continue
            if local_attr not in SAFE_SVG_ATTRS:
                continue
            if _svg_value_is_unsafe(value):
                raise web.HTTPBadRequest(text=f"{filename} contains unsafe SVG attribute values.")
            if not SAFE_SVG_VALUE_RE.fullmatch(value):
                raise web.HTTPBadRequest(
                    text=f"{filename} contains unsupported SVG attribute values."
                )
            clean_attrs[local_attr] = value

        element.attrib.clear()
        element.attrib.update(clean_attrs)

    root.attrib["xmlns"] = "http://www.w3.org/2000/svg"
    return ET.tostring(root, encoding="unicode", short_empty_elements=True)


def _catalogued_piece_css_selector(variant_name: str, key: str) -> str:
    # key format is wP, bP, w+P, b+P. Accept *.svg legacy keys too.
    key = _catalogued_piece_set_storage_key(key)
    color = "white" if key[0] == "w" else "black"
    promoted = key[1] == "+"
    letter = key[2 if promoted else 1].lower()
    role_class = f"p{letter}-piece" if promoted else f"{letter}-piece"
    style_class = f".piece-style-catalogued-{variant_name}-custom"
    return (
        f"{style_class} piece.{role_class}.{color}, "
        f"label.piece.catalogued-custom-preview{style_class}.{role_class}.{color}"
    )


def _catalogued_piece_set_css(variant_name: str, piece_set: Mapping[str, Any]) -> str:
    lines: list[str] = []
    for key in sorted(piece_set):
        item = piece_set[key]
        svg = str(item.get("svg") if isinstance(item, Mapping) else "")
        if not svg:
            continue
        data = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        lines.append(
            f"{_catalogued_piece_css_selector(variant_name, key)} "
            "{background-position:center;background-size:contain;background-repeat:no-repeat;background-image:"
            f'url("data:image/svg+xml;base64,{data}");}}'
        )
    return "\n".join(lines) + "\n"


def _catalogued_disguised_piece_css(variant_name: str) -> str:
    style_class = f".piece-style-catalogued-{variant_name}-disguised"
    preview_class = f"label.piece.catalogued-disguised-preview{style_class}.white"
    white_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
        '<circle cx="256" cy="256" r="170" fill="#fff" stroke="#000" stroke-width="20"/>'
        "</svg>"
    )
    black_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
        '<circle cx="256" cy="256" r="170" fill="#000" stroke="#000" stroke-width="20"/>'
        "</svg>"
    )
    white_data = base64.b64encode(white_svg.encode("utf-8")).decode("ascii")
    black_data = base64.b64encode(black_svg.encode("utf-8")).decode("ascii")
    return (
        "\n".join(
            (
                f'{style_class} piece.white, {preview_class} {{background-image:url("data:image/svg+xml;base64,{white_data}");background-position:center;background-size:contain;background-repeat:no-repeat;}}',
                f'{style_class} piece.black {{background-image:url("data:image/svg+xml;base64,{black_data}");background-position:center;background-size:contain;background-repeat:no-repeat;}}',
            )
        )
        + "\n"
    )


def _has_complete_piece_set(doc: Mapping[str, Any]) -> bool:
    piece_set = doc.get("pieceSet")
    if not isinstance(piece_set, Mapping):
        return False
    return {
        _catalogued_piece_set_storage_key(str(key)) for key in piece_set
    } == _catalogued_piece_set_required_keys(doc)


def catalogued_king_roles(ini: str, pieces: list[str]) -> list[str]:
    extinction_value = _ini_option(ini, "extinctionValue")
    if extinction_value is not None:
        # Extinction/custom-goal variants often have no royal/check concept.
        # Do not invent a king role just because one of the piece letters is "k".
        pseudo_royal = _ini_bool(ini, "extinctionPseudoRoyal", default=False)
        if not pseudo_royal:
            return []

    return ["k"] if "k" in pieces else []


async def _run_process(args: list[str], *, stdin: str | None = None) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=PROJECT_ROOT,
        )
    except FileNotFoundError as exc:
        raise web.HTTPServiceUnavailable(
            text=f"Fairy-Stockfish checker executable was not found: {args[0]}"
        ) from exc

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(stdin.encode("utf-8") if stdin is not None else None),
            timeout=FSF_CHECK_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise web.HTTPBadRequest(text="Fairy-Stockfish check timed out.") from exc

    return proc.returncode or 0, (stdout + stderr).decode("utf-8", errors="replace")


async def _check_ini_with_pyffish_child(ini: str, name: str) -> str:
    """Validate in a child process so trial checks do not mutate server pyffish state."""
    _ensure_catalogued_ini_size(ini)

    code = """
import json
import sys

import pyffish as sf

name = sys.argv[1]
ini = sys.stdin.read()
try:
    sf.set_option("VariantPath", "variants.ini")
    sf.load_variant_config(ini)
    start_fen = sf.start_fen(name)
    if not start_fen:
        raise RuntimeError("Fairy-Stockfish did not return a start FEN.")
    status = sf.validate_fen(start_fen, name, False)
    if status != sf.FEN_OK:
        raise RuntimeError(f"The start FEN is invalid for {name} (status {status}).")
    print(json.dumps({"ok": True, "startFen": start_fen}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc)}))
    raise
"""
    returncode, output = await _run_process([sys.executable, "-c", code, name], stdin=ini)

    if returncode != 0:
        log.info(
            "Fairy-Stockfish validation failed for catalogued variant %s: %s",
            name,
            _one_line_log_text(output),
        )
        raise web.HTTPBadRequest(text="Fairy-Stockfish rejected this variant definition.")

    try:
        payload = json.loads(output.splitlines()[-1])
        return str(payload.get("startFen") or "")
    except Exception:
        log.info(
            "Fairy-Stockfish validation returned invalid output for catalogued variant %s: %s",
            name,
            _one_line_log_text(output),
            exc_info=True,
        )
        raise web.HTTPBadRequest(
            text="Fairy-Stockfish validation returned invalid output."
        ) from None


async def check_catalogued_ini_without_mutating_server(ini: str, name: str) -> str:
    """Validate with pyffish in a child process.

    pychess.org does not ship a native Fairy-Stockfish executable on the web
    server, and upstream bindings do not expose the UCI `check` command. Import
    the already-installed pyffish package in a short-lived child process instead:
    this catches parser/start-FEN/FEN-validation failures without registering
    trial variants in the long-running server process.
    """
    return await _check_ini_with_pyffish_child(ini, name)


def _is_builtin_variant_name(name: str) -> bool:
    # Do not use the mutable ALL_VARIANTS map here. A previously-buggy upload
    # could have registered a catalogued variant with a built-in key and hidden
    # the original entry in ALL_VARIANTS. ServerVariants is the stable source
    # for built-in site names, while sf.variants() at import time covers
    # Fairy-Stockfish-only built-ins such as tencubed.
    return name in BUILTIN_VARIANT_NAMES or name in BUILTIN_FSF_VARIANT_NAMES


async def ensure_catalogued_variant_name_available(
    app_state: Any,
    name: str,
    *,
    current_name: str | None = None,
) -> None:
    """Ensure a user-uploaded variant key is globally unique.

    Names are game document variant codes, FSF UCI_Variant keys, URL slugs, and
    catalog keys, so they must not collide with built-ins or any active/archived
    catalogued variant owned by any user.
    """
    if _is_builtin_variant_name(name):
        raise web.HTTPConflict(text="This variant name conflicts with an existing built-in variant.")

    if current_name is not None and name == current_name:
        return

    if name in CATALOGUED_VARIANTS:
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.")

    if name in getattr(app_state, "catalogued_variants", {}):
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.")

    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    existing = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one(
        {"_id": name}, projection={"_id": 1}
    )
    if existing is not None:
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.")


def validate_catalogued_ini(
    ini: str,
) -> tuple[str, str, int, int, list[str], list[str], list[str], bool, list[str]]:
    _ensure_catalogued_ini_size(ini)
    name = extract_variant_name(ini)

    try:
        sf.load_variant_config(ini)
        start_fen = sf.start_fen(name)
    except Exception:
        log.info("Fairy-Stockfish rejected catalogued variant %s", name, exc_info=True)
        raise web.HTTPBadRequest(text="Fairy-Stockfish rejected this variant definition.") from None

    if not start_fen:
        raise web.HTTPBadRequest(
            text="Fairy-Stockfish did not provide a start FEN for this variant."
        )

    width, height = board_dimensions_from_fen(start_fen)
    _catalogued_grand_from_dimensions(width, height)
    pieces = _merge_piece_letters(
        piece_letters_from_fen(start_fen), _ini_piece_letters(ini, "promotionPieceTypes")
    )
    king_roles = catalogued_king_roles(ini, pieces)
    pocket_roles = catalogued_pocket_roles(ini, start_fen, pieces)
    capture_to_hand = _ini_bool(ini, "capturesToHand", default=False)
    promotion_roles = catalogued_promotion_roles(ini, pieces)

    return (
        name,
        start_fen,
        width,
        height,
        pieces,
        king_roles,
        pocket_roles,
        capture_to_hand,
        promotion_roles,
    )


def _client_doc(
    doc: Mapping[str, Any], *, game_count: int | None = None
) -> CataloguedVariantClientDocument:
    description = str(doc.get("description") or "")
    tooltip = description or "Catalogued variant"
    ini = str(doc["ini"])
    start_fen = str(doc["startFen"])
    pieces = list(doc.get("pieces") or ["k"])
    king_roles = (
        catalogued_king_roles(ini, pieces)
        if _ini_option(ini, "extinctionValue") is not None
        else list(doc.get("kingRoles") or catalogued_king_roles(ini, pieces))
    )
    pocket_roles = list(doc.get("pocketRoles") or catalogued_pocket_roles(ini, start_fen, pieces))
    capture_to_hand = bool(
        doc.get("captureToHand", _ini_bool(ini, "capturesToHand", default=False))
    )
    promotion_roles = list(doc.get("promotionRoles") or catalogued_promotion_roles(ini, pieces))

    client_doc: CataloguedVariantClientDocument = {
        "name": str(doc["name"]),
        "displayName": str(doc.get("displayName") or doc["name"]),
        "tooltip": tooltip,
        "ini": ini,
        "startFen": start_fen,
        "width": int(doc["width"]),
        "height": int(doc["height"]),
        "pieces": pieces,
        "kingRoles": king_roles,
        "pocketRoles": pocket_roles,
        "captureToHand": capture_to_hand,
        "promotionRoles": promotion_roles,
        "icon": str(doc.get("icon") or CATALOGUED_ICON),
        "category": CATALOGUED_CATEGORY,
        "author": str(doc.get("author") or ""),
        "visibility": _catalogued_visibility(doc),
        "hasPieceSet": _has_complete_piece_set(doc),
        "archived": bool(doc.get("archived", False)),
        "enabled": bool(doc.get("enabled", True)),
    }
    if client_doc["hasPieceSet"]:
        client_doc["pieceSetRevision"] = _piece_set_revision(doc)
    if game_count is not None:
        client_doc["gameCount"] = game_count
        client_doc["locked"] = game_count > 0
    return client_doc


async def find_catalogued_variant_doc(
    app_state: Any,
    name: str,
    username: str | None = None,
) -> Mapping[str, Any] | None:
    docs = getattr(app_state, "catalogued_variants", {})
    doc = docs.get(name)
    if doc is None and app_state.db is not None:
        doc = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if doc is None or not _can_open_catalogued_doc(username, doc):
        return None
    return doc


def catalogued_variant_client_doc_for_name(
    app_state: Any,
    name: str,
    username: str | None = None,
) -> CataloguedVariantClientDocument | None:
    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None or not _can_open_catalogued_doc(username, doc):
        return None
    return _client_doc(doc)


def can_create_catalogued_seek(app_state: Any, name: str, username: str | None) -> bool:
    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return False
    return _can_open_catalogued_doc(username, doc)


def catalogued_variant_rule_context(doc: Mapping[str, Any]) -> dict[str, Any]:
    ini = str(doc.get("ini") or "")
    start_fen = str(doc.get("startFen") or "")
    pieces = list(doc.get("pieces") or piece_letters_from_fen(start_fen or "8/8/8/8/8/8/8/8"))
    width = int(doc.get("width") or 0)
    height = int(doc.get("height") or 0)
    if not width or not height:
        width, height = board_dimensions_from_fen(start_fen) if start_fen else (8, 8)

    return {
        "name": str(doc.get("name") or doc.get("_id") or ""),
        "displayName": str(
            doc.get("displayName") or doc.get("name") or doc.get("_id") or "Catalogued variant"
        ),
        "description": str(doc.get("description") or ""),
        "author": str(doc.get("author") or ""),
        "ini": ini,
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": ", ".join(pieces),
        "pocketRoles": ", ".join(
            list(doc.get("pocketRoles") or catalogued_pocket_roles(ini, start_fen, pieces))
        ),
        "promotionRoles": ", ".join(
            list(doc.get("promotionRoles") or catalogued_promotion_roles(ini, pieces))
        ),
        "captureToHand": bool(
            doc.get("captureToHand", _ini_bool(ini, "capturesToHand", default=False))
        ),
        "enabled": bool(doc.get("enabled", True)),
        "archived": bool(doc.get("archived", False)),
        "visibility": _catalogued_visibility(doc),
        "ruleSummary": catalogued_rule_summary(doc),
        "customPieceDiagrams": catalogued_betza_diagrams(doc),
    }


def catalogued_variants_for_client(
    app_state: Any,
    username: str | None = None,
) -> list[CataloguedVariantClientDocument]:
    docs = getattr(app_state, "catalogued_variants", {})
    return [
        _client_doc(doc)
        for doc in sorted(
            docs.values(), key=lambda item: str(item.get("displayName", item["name"])).casefold()
        )
        if _can_preload_catalogued_doc(username, doc)
    ]


def register_catalogued_variant_doc(
    app_state: Any,
    doc: Mapping[str, Any],
    *,
    load_config: bool = True,
) -> None:
    name = str(doc["name"])
    if not _is_active_catalogued_doc(doc):
        getattr(app_state, "catalogued_variants", {}).pop(name, None)
        unregister_catalogued_server_variant(name)
        return

    if load_config:
        sf.load_variant_config(str(doc["ini"]))

    width = int(doc.get("width") or 0)
    height = int(doc.get("height") or 0)
    if not width or not height:
        width, height = board_dimensions_from_fen(str(doc["startFen"]))

    register_catalogued_server_variant(
        name,
        str(doc.get("displayName") or name),
        str(doc.get("icon") or CATALOGUED_ICON),
        grand=_catalogued_grand_from_dimensions(width, height),
        extended_move_codec=_catalogued_extended_move_codec_from_dimensions(width, height),
    )
    app_state.catalogued_variants[name] = dict(doc)


def ensure_catalogued_variant_from_game_doc(app_state: Any, doc: Mapping[str, Any]) -> None:
    """Load an inline variant definition saved with a historical game if needed."""
    code = str(doc.get("v") or "")
    if not code or is_catalogued_variant(code) or not doc.get("vini"):
        return

    (
        name,
        start_fen,
        width,
        height,
        pieces,
        king_roles,
        pocket_roles,
        capture_to_hand,
        promotion_roles,
    ) = validate_catalogued_ini(str(doc["vini"]))
    if name != code:
        raise ValueError(f"Inline game variant INI defines {name!r}, but game uses {code!r}")

    now = datetime.now(timezone.utc)
    register_catalogued_variant_doc(
        app_state,
        {
            "_id": name,
            "name": name,
            "displayName": str(doc.get("vd") or name),
            "description": "Loaded from saved game",
            "author": str(doc.get("vby") or ""),
            "ini": str(doc["vini"]),
            "enabled": True,
            "archived": False,
            "startFen": start_fen,
            "width": width,
            "height": height,
            "pieces": pieces,
            "kingRoles": king_roles,
            "pocketRoles": pocket_roles,
            "captureToHand": capture_to_hand,
            "promotionRoles": promotion_roles,
            "icon": CATALOGUED_ICON,
            "category": CATALOGUED_CATEGORY,
            "visibility": CATALOGUED_VISIBILITY_PRIVATE,
            "createdAt": now,
            "updatedAt": now,
        },
        load_config=False,
    )


async def init_catalogued_variants(app_state: Any, db_collections: list[str]) -> None:
    app_state.catalogued_variants = {}

    if CATALOGUED_VARIANT_COLLECTION not in db_collections:
        await app_state.db.create_collection(CATALOGUED_VARIANT_COLLECTION)

    collection = app_state.db[CATALOGUED_VARIANT_COLLECTION]
    await collection.create_index("name", unique=True)
    await collection.create_index("enabled")
    await collection.create_index("archived")
    await collection.create_index("author")
    await collection.create_index("visibility")
    await collection.create_index("createdAt")

    cursor = collection.find({"enabled": {"$ne": False}, "archived": {"$ne": True}})
    async for doc in cursor:
        try:
            register_catalogued_variant_doc(app_state, doc)
        except Exception:
            log.exception("Failed to load catalogued variant %s", doc.get("name"))


async def get_catalogued_variants(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _optional_human_username(request)
    return json_response({"variants": catalogued_variants_for_client(app_state, username)})


async def _optional_human_username(request: web.Request) -> str | None:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    username = session.get("user_name")
    if not username or str(username).startswith(ANON_PREFIX):
        return None

    user = await app_state.users.get(username)
    if user.anon or user.bot:
        return None

    return str(username)


async def _current_human_username(request: web.Request) -> str:
    app_state = get_app_state(request.app)
    session = await aiohttp_session.get_session(request)
    username = session.get("user_name")
    if not username or str(username).startswith(ANON_PREFIX):
        raise web.HTTPForbidden(text="Only logged-in users can manage catalogued variants.")

    user = await app_state.users.get(username)
    if user.anon or user.bot:
        raise web.HTTPForbidden(text="Only logged-in human users can manage catalogued variants.")

    return str(username)


def _can_modify(username: str, doc: Mapping[str, Any]) -> bool:
    return doc.get("author") == username or _is_admin_username(username)


async def _game_count(app_state: Any, name: str) -> int:
    if app_state.db is None:
        return 0
    return await app_state.db.game.count_documents({"v": name})


async def _has_games(app_state: Any, name: str) -> bool:
    if app_state.db is None:
        return False
    return await app_state.db.game.find_one({"v": name}, projection={"_id": 1}) is not None


async def _catalogued_variant_count_for_user(app_state: Any, username: str) -> int:
    if app_state.db is None:
        return 0
    return await app_state.db[CATALOGUED_VARIANT_COLLECTION].count_documents({"author": username})


async def _ensure_catalogued_variant_quota(app_state: Any, username: str) -> None:
    if _is_admin_username(username):
        return
    count = await _catalogued_variant_count_for_user(app_state, username)
    if count >= MAX_CATALOGUED_VARIANTS_PER_USER:
        raise web.HTTPConflict(
            text=(
                f"You can have at most {MAX_CATALOGUED_VARIANTS_PER_USER} user-defined variants. "
                "Delete an unused variant before uploading or cloning another one."
            )
        )


def _search_regex(text: str) -> re.Pattern[str]:
    # Escape user text before handing it to MongoDB as a regex. This keeps the
    # community search simple while avoiding user-controlled regex execution.
    return re.compile(re.escape(text), re.IGNORECASE)


async def community_catalogued_variants_page(
    app_state: Any,
    *,
    q: str = "",
    author: str = "",
    sort: str = "updated",
    page: int = 1,
) -> dict[str, Any]:
    q = q.strip()[:80]
    author = author.strip()[:40]
    page = max(1, page)

    if app_state.db is None:
        return {
            "variants": [],
            "q": q,
            "author": author,
            "sort": sort,
            "page": 1,
            "pages": 1,
            "total": 0,
            "prev_page": None,
            "next_page": None,
        }

    query = _catalogued_public_query()
    if q:
        regex = _search_regex(q)
        query["$or"] = [
            {"name": {"$regex": regex}},
            {"displayName": {"$regex": regex}},
            {"description": {"$regex": regex}},
            {"author": {"$regex": regex}},
        ]
    if author:
        query["author"] = author

    if sort == "name":
        sort_spec = [("displayName", 1), ("name", 1)]
    elif sort == "newest":
        sort_spec = [("createdAt", -1), ("name", 1)]
    else:
        sort = "updated"
        sort_spec = [("updatedAt", -1), ("name", 1)]

    total = await app_state.db[CATALOGUED_VARIANT_COLLECTION].count_documents(query)
    pages = max(1, (total + CATALOGUED_COMMUNITY_PAGE_SIZE - 1) // CATALOGUED_COMMUNITY_PAGE_SIZE)
    page = min(page, pages)
    skip = (page - 1) * CATALOGUED_COMMUNITY_PAGE_SIZE

    variants: list[dict[str, Any]] = []
    cursor = (
        app_state.db[CATALOGUED_VARIANT_COLLECTION]
        .find(query)
        .sort(sort_spec)
        .skip(skip)
        .limit(CATALOGUED_COMMUNITY_PAGE_SIZE)
    )
    async for doc in cursor:
        name = str(doc.get("name") or doc.get("_id") or "")
        count = await _game_count(app_state, name) if name else 0
        variants.append(
            {
                "name": name,
                "displayName": str(doc.get("displayName") or name),
                "description": str(doc.get("description") or ""),
                "author": str(doc.get("author") or ""),
                "width": int(doc.get("width") or 0),
                "height": int(doc.get("height") or 0),
                "gameCount": count,
                "updatedAt": doc.get("updatedAt"),
            }
        )

    return {
        "variants": variants,
        "q": q,
        "author": author,
        "sort": sort,
        "page": page,
        "pages": pages,
        "total": total,
        "prev_page": page - 1 if page > 1 else None,
        "next_page": page + 1 if page < pages else None,
    }


async def _read_upload_payload(request: web.Request) -> tuple[str, str, str, str]:
    content_type = request.content_type or ""

    if content_type == "application/json":
        data = await read_json_data(request)
        if not isinstance(data, Mapping):
            raise web.HTTPBadRequest(text="Expected JSON object.")
        ini = str(data.get("ini") or "")
        display_name = str(data.get("displayName") or data.get("display_name") or "")
        description = str(data.get("description") or "")
        visibility = _clean_visibility(str(data.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE))
        return ini, display_name, description, visibility

    if content_type.startswith("text/"):
        ini = await read_text_data(request)
        return ini or "", "", "", CATALOGUED_VISIBILITY_PRIVATE

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPBadRequest(text="Missing form data.")

    upload = data.get("file") or data.get("ini_file")
    if hasattr(upload, "file"):
        raw = upload.file.read(MAX_CATALOGUED_INI_BYTES + 1)
        ini = raw.decode("utf-8", errors="replace")
    else:
        ini = str(data.get("ini") or "")

    display_name = str(data.get("displayName") or data.get("display_name") or "")
    description = str(data.get("description") or "")
    visibility = _clean_visibility(str(data.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE))
    return ini, display_name, description, visibility


async def check_catalogued_variant_rules(request: web.Request) -> web.Response:
    await _current_human_username(request)
    app_state = get_app_state(request.app)
    data = await read_json_data(request)
    if not isinstance(data, Mapping):
        raise web.HTTPBadRequest(text="Expected JSON object.")

    ini = str(data.get("ini") or "").strip()
    current_name = data.get("currentName")
    current_name = str(current_name) if current_name else None
    if not ini:
        raise web.HTTPBadRequest(text="Missing INI content.")

    name = extract_variant_name(ini)
    await ensure_catalogued_variant_name_available(app_state, name, current_name=current_name)
    start_fen = await check_catalogued_ini_without_mutating_server(ini, name)
    return json_response({"ok": True, "name": name, "startFen": start_fen})


def _clean_display_name(display_name: str, fallback: str) -> str:
    return (display_name or fallback).strip()[:MAX_DISPLAY_NAME_LEN] or fallback


def _clean_description(description: str) -> str:
    return description.strip()[:MAX_DESCRIPTION_LEN]


def _build_doc(
    *,
    name: str,
    display_name: str,
    description: str,
    username: str,
    ini: str,
    start_fen: str,
    width: int,
    height: int,
    pieces: list[str],
    king_roles: list[str],
    pocket_roles: list[str],
    capture_to_hand: bool,
    promotion_roles: list[str],
    created_at: datetime,
    visibility: str = CATALOGUED_VISIBILITY_PRIVATE,
    archived: bool = False,
) -> CataloguedVariantDocument:
    return {
        "_id": name,
        "name": name,
        "displayName": _clean_display_name(display_name, name),
        "description": _clean_description(description),
        "author": username,
        "ini": ini,
        "enabled": not archived,
        "archived": archived,
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": pieces,
        "kingRoles": king_roles,
        "pocketRoles": pocket_roles,
        "captureToHand": capture_to_hand,
        "promotionRoles": promotion_roles,
        "icon": CATALOGUED_ICON,
        "category": CATALOGUED_CATEGORY,
        "visibility": _clean_visibility(visibility),
        "createdAt": created_at,
        "updatedAt": datetime.now(timezone.utc),
    }


async def upload_catalogued_variant(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _current_human_username(request)
    ini, display_name, description, visibility = await _read_upload_payload(request)
    ini = ini.strip()
    await _ensure_catalogued_variant_quota(app_state, username)
    if not ini:
        raise web.HTTPBadRequest(text="Missing INI content.")

    # Check uniqueness before asking FSF to load the config. load_variant_config()
    # is intentionally global and should not be called for a duplicate upload.
    name = extract_variant_name(ini)
    await ensure_catalogued_variant_name_available(app_state, name)
    await check_catalogued_ini_without_mutating_server(ini, name)

    (
        name,
        start_fen,
        width,
        height,
        pieces,
        king_roles,
        pocket_roles,
        capture_to_hand,
        promotion_roles,
    ) = validate_catalogued_ini(ini)

    now = datetime.now(timezone.utc)
    doc = _build_doc(
        name=name,
        display_name=display_name,
        description=description,
        username=username,
        ini=ini,
        start_fen=start_fen,
        width=width,
        height=height,
        pieces=pieces,
        king_roles=king_roles,
        pocket_roles=pocket_roles,
        capture_to_hand=capture_to_hand,
        promotion_roles=promotion_roles,
        created_at=now,
        visibility=visibility,
    )

    try:
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].insert_one(doc)
    except DuplicateKeyError as exc:
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.") from exc

    register_catalogued_variant_doc(app_state, doc, load_config=False)
    return json_response({"ok": True, "variant": _client_doc(doc, game_count=0)})


async def upload_catalogued_piece_set(request: web.Request) -> web.Response:
    app_state, _username, name, doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")
    if not _is_active_catalogued_doc(doc):
        raise web.HTTPConflict(text="Archived variants cannot have custom piece sets.")

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPBadRequest(text="Missing form data.")

    uploads = []
    if hasattr(data, "getall"):
        uploads.extend(data.getall("pieces", []))
        uploads.extend(data.getall("files", []))
        uploads.extend(data.getall("file", []))
    if not uploads:
        raise web.HTTPBadRequest(text="Upload one SVG file for every required piece.")

    required = _catalogued_piece_set_required_keys(doc)
    if not required:
        raise web.HTTPBadRequest(text="This variant has no renderable piece roles.")

    piece_set: dict[str, CataloguedVariantPieceSetSvg] = {}
    total_size = 0
    for upload in uploads:
        filename = str(getattr(upload, "filename", "") or "").strip()
        if not filename:
            raise web.HTTPBadRequest(text="Every uploaded file must have a filename.")
        canonical = _canonical_piece_set_filename(filename)
        if canonical is None:
            raise web.HTTPBadRequest(
                text="Piece SVG filenames must look like wP.svg, bP.svg, w+P.svg, or b+P.svg."
            )
        key = _catalogued_piece_set_storage_key(canonical)
        if key in piece_set:
            raise web.HTTPBadRequest(text=f"Duplicate piece SVG: {canonical}.")
        if key not in required:
            raise web.HTTPBadRequest(text=f"Unexpected piece SVG: {canonical}.")
        if not hasattr(upload, "file"):
            raise web.HTTPBadRequest(text=f"{canonical} is not a file upload.")

        raw = upload.file.read(MAX_CATALOGUED_PIECE_SVG_BYTES + 1)
        total_size += len(raw)
        if total_size > MAX_CATALOGUED_PIECE_SET_TOTAL_BYTES:
            raise web.HTTPBadRequest(
                text=(
                    "The piece set is too large. "
                    f"All SVGs together must be at most "
                    f"{MAX_CATALOGUED_PIECE_SET_TOTAL_BYTES // 1024} KiB."
                )
            )
        svg = _sanitize_catalogued_piece_svg(raw, canonical)
        piece_set[key] = {"svg": svg, "size": len(svg.encode("utf-8"))}

    uploaded = set(piece_set)
    if uploaded != required:
        missing = ", ".join(
            _catalogued_piece_set_public_filename(key) for key in sorted(required - uploaded)
        )
        extra = ", ".join(
            _catalogued_piece_set_public_filename(key) for key in sorted(uploaded - required)
        )
        details = []
        if missing:
            details.append(f"missing: {missing}")
        if extra:
            details.append(f"extra: {extra}")
        raise web.HTTPBadRequest(
            text="Custom piece sets must be complete and exact (" + "; ".join(details) + ")."
        )

    now = datetime.now(timezone.utc)
    result = await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$set": {"pieceSet": piece_set, "pieceSetUpdatedAt": now, "updatedAt": now}},
    )
    if result.matched_count != 1:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    updated = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if updated is None:
        raise web.HTTPNotFound(text="Catalogued variant not found after update.")
    app_state.catalogued_variants[name] = updated
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(updated, game_count=count)})


async def delete_catalogued_piece_set(request: web.Request) -> web.Response:
    app_state, _username, name, doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    now = datetime.now(timezone.utc)
    result = await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$unset": {"pieceSet": "", "pieceSetUpdatedAt": ""}, "$set": {"updatedAt": now}},
    )
    if result.matched_count != 1:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    updated = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if updated is None:
        raise web.HTTPNotFound(text="Catalogued variant not found after update.")
    app_state.catalogued_variants[name] = updated
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(updated, game_count=count)})


async def get_catalogued_piece_css(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _optional_human_username(request)
    name = request.match_info["name"]
    doc = await find_catalogued_variant_doc(app_state, name, username)
    if doc is None:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    piece_set = doc.get("pieceSet")
    if not isinstance(piece_set, Mapping) or not _has_complete_piece_set(doc):
        raise web.HTTPNotFound(text="This variant has no complete custom piece set.")

    return web.Response(
        text=_catalogued_piece_set_css(str(doc["name"]), piece_set),
        content_type="text/css",
        headers={"Cache-Control": "private, max-age=300"},
    )


async def get_catalogued_disguised_piece_css(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _optional_human_username(request)
    name = request.match_info["name"]
    doc = await find_catalogued_variant_doc(app_state, name, username)
    if doc is None:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    return web.Response(
        text=_catalogued_disguised_piece_css(str(doc["name"])),
        content_type="text/css",
        headers={"Cache-Control": "private, max-age=300"},
    )


async def get_my_catalogued_variants(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _current_human_username(request)
    query: dict[str, Any] = (
        {}
        if _is_admin_username(username) and request.rel_url.query.get("all") == "1"
        else {"author": username}
    )

    variants: list[CataloguedVariantClientDocument] = []
    if app_state.db is not None:
        cursor = app_state.db[CATALOGUED_VARIANT_COLLECTION].find(query).sort("updatedAt", -1)
        async for doc in cursor:
            count = await _game_count(app_state, str(doc["name"]))
            variants.append(_client_doc(doc, game_count=count))

    max_variants = None if _is_admin_username(username) else MAX_CATALOGUED_VARIANTS_PER_USER
    return json_response({"variants": variants, "maxVariants": max_variants})


async def _load_owned_doc(request: web.Request) -> tuple[Any, str, str, Mapping[str, Any]]:
    app_state = get_app_state(request.app)
    username = await _current_human_username(request)
    name = request.match_info["name"]

    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    doc = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if doc is None:
        raise web.HTTPNotFound(text="Catalogued variant not found.")
    if not _can_modify(username, doc):
        raise web.HTTPForbidden(text="You can only manage your own catalogued variants.")

    return app_state, username, name, doc


async def update_catalogued_variant(request: web.Request) -> web.Response:
    app_state, username, old_name, existing = await _load_owned_doc(request)

    ini, display_name, description, visibility = await _read_upload_payload(request)
    ini = ini.strip()
    if not ini:
        raise web.HTTPBadRequest(text="Missing INI content.")

    new_name = extract_variant_name(ini)
    rules_changed = ini != str(existing.get("ini") or "")
    if (rules_changed or new_name != old_name) and await _has_games(app_state, old_name):
        raise web.HTTPConflict(
            text="This variant already has games. Its rules are locked; clone it to make a changed version."
        )

    if rules_changed and new_name == old_name:
        raise web.HTTPConflict(
            text=(
                "Changing rules requires a new variant section name because Fairy-Stockfish "
                "cannot replace an already loaded runtime variant. Rename the [section] or clone this variant."
            )
        )

    if new_name != old_name:
        await ensure_catalogued_variant_name_available(app_state, new_name, current_name=old_name)

    if rules_changed or new_name != old_name:
        await check_catalogued_ini_without_mutating_server(ini, new_name)
        (
            new_name,
            start_fen,
            width,
            height,
            pieces,
            king_roles,
            pocket_roles,
            capture_to_hand,
            promotion_roles,
        ) = validate_catalogued_ini(ini)
    else:
        start_fen = str(existing["startFen"])
        width = int(existing["width"])
        height = int(existing["height"])
        pieces = list(existing.get("pieces") or ["k"])
        king_roles = list(existing.get("kingRoles") or [])
        pocket_roles = list(
            existing.get("pocketRoles") or catalogued_pocket_roles(ini, start_fen, pieces)
        )
        capture_to_hand = bool(
            existing.get("captureToHand", _ini_bool(ini, "capturesToHand", default=False))
        )
        promotion_roles = list(
            existing.get("promotionRoles") or catalogued_promotion_roles(ini, pieces)
        )

    doc = _build_doc(
        name=new_name,
        display_name=display_name,
        description=description,
        username=str(existing.get("author") or username),
        ini=ini,
        start_fen=start_fen,
        width=width,
        height=height,
        pieces=pieces,
        king_roles=king_roles,
        pocket_roles=pocket_roles,
        capture_to_hand=capture_to_hand,
        promotion_roles=promotion_roles,
        created_at=existing.get("createdAt", datetime.now(timezone.utc)),
        visibility=visibility,
        archived=bool(existing.get("archived", False)),
    )

    if not rules_changed and new_name == old_name and _has_complete_piece_set(existing):
        doc["pieceSet"] = existing["pieceSet"]
        if "pieceSetUpdatedAt" in existing:
            doc["pieceSetUpdatedAt"] = existing["pieceSetUpdatedAt"]

    if new_name != old_name:
        try:
            await app_state.db[CATALOGUED_VARIANT_COLLECTION].insert_one(doc)
        except DuplicateKeyError as exc:
            raise web.HTTPConflict(
                text="A catalogued variant with this name already exists."
            ) from exc
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].delete_one({"_id": old_name})
        unregister_catalogued_server_variant(old_name)
        app_state.catalogued_variants.pop(old_name, None)
    else:
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].replace_one({"_id": new_name}, doc)

    register_catalogued_variant_doc(app_state, doc, load_config=False)
    return json_response(
        {"ok": True, "oldName": old_name, "variant": _client_doc(doc, game_count=0)}
    )


async def delete_catalogued_variant(request: web.Request) -> web.Response:
    app_state, _username, name, _doc = await _load_owned_doc(request)
    if await _has_games(app_state, name):
        raise web.HTTPConflict(
            text="This variant already has games. Archive it instead of deleting it."
        )

    await app_state.db[CATALOGUED_VARIANT_COLLECTION].delete_one({"_id": name})
    app_state.catalogued_variants.pop(name, None)
    unregister_catalogued_server_variant(name)
    return json_response({"ok": True, "deleted": name})


async def archive_catalogued_variant(request: web.Request) -> web.Response:
    app_state, _username, name, _doc = await _load_owned_doc(request)
    now = datetime.now(timezone.utc)
    await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$set": {"archived": True, "enabled": False, "updatedAt": now}},
    )
    app_state.catalogued_variants.pop(name, None)
    unregister_catalogued_server_variant(name)
    return json_response({"ok": True, "archived": name})


async def restore_catalogued_variant(request: web.Request) -> web.Response:
    app_state, _username, name, doc = await _load_owned_doc(request)
    now = datetime.now(timezone.utc)
    restored = dict(doc)
    restored["archived"] = False
    restored["enabled"] = True
    restored["updatedAt"] = now

    await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$set": {"archived": False, "enabled": True, "updatedAt": now}},
    )
    register_catalogued_variant_doc(app_state, restored, load_config=True)
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(restored, game_count=count)})


async def clone_catalogued_variant(request: web.Request) -> web.Response:
    app_state, username, name, doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    await _ensure_catalogued_variant_quota(app_state, username)

    for n in range(2, 100):
        suffix = f"_v{n}"
        candidate = f"{name[: 32 - len(suffix)]}{suffix}"
        try:
            await ensure_catalogued_variant_name_available(app_state, candidate)
        except web.HTTPConflict:
            continue
        new_name = candidate
        break
    else:
        raise web.HTTPConflict(text="Could not find a free variant name for the clone.")

    ini = replace_variant_section_name(str(doc["ini"]), new_name)
    await check_catalogued_ini_without_mutating_server(ini, new_name)
    (
        new_name,
        start_fen,
        width,
        height,
        pieces,
        king_roles,
        pocket_roles,
        capture_to_hand,
        promotion_roles,
    ) = validate_catalogued_ini(ini)

    now = datetime.now(timezone.utc)
    display_name = f"{doc.get('displayName') or name} v{new_name.rsplit('_v', 1)[-1]}"
    cloned = _build_doc(
        name=new_name,
        display_name=display_name,
        description=str(doc.get("description") or ""),
        username=username,
        ini=ini,
        start_fen=start_fen,
        width=width,
        height=height,
        pieces=pieces,
        king_roles=king_roles,
        pocket_roles=pocket_roles,
        capture_to_hand=capture_to_hand,
        promotion_roles=promotion_roles,
        created_at=now,
    )

    try:
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].insert_one(cloned)
    except DuplicateKeyError as exc:
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.") from exc

    register_catalogued_variant_doc(app_state, cloned, load_config=False)
    return json_response({"ok": True, "variant": _client_doc(cloned, game_count=0)})
