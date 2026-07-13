from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any


class FsfVariantInfoError(ValueError):
    pass


REQUIRED_SECTIONS: dict[str, frozenset[str]] = {
    "board": frozenset({"width", "height", "startFen", "chess960", "twoBoards"}),
    "movement": frozenset(
        {
            "mobilityRegions",
            "doubleStep",
            "doubleStepRegions",
            "tripleStepRegions",
            "enPassantRegions",
            "enPassantTypes",
            "pass",
            "passOnStalemate",
            "mustCapture",
            "immobilityIllegal",
            "cambodianMoves",
            "makpongRule",
            "flyingGeneral",
        }
    ),
    "promotion": frozenset(
        {
            "regions",
            "mainPawnTypes",
            "pawnTypes",
            "pieceTypes",
            "promotedPieceTypes",
            "limits",
            "sittuyin",
            "onCapture",
            "mandatoryPawn",
            "mandatoryPiece",
            "demotion",
            "shogiStyle",
        }
    ),
    "capture": frozenset(
        {
            "blast",
            "blastImmuneTypes",
            "mutuallyImmuneTypes",
            "petrifyTypes",
            "petrifyBlastPieces",
        }
    ),
    "castling": frozenset(
        {
            "enabled",
            "droppedPiece",
            "kingSideFile",
            "queenSideFile",
            "rank",
            "kingFile",
            "kingPieces",
            "rookPieces",
            "opposite",
            "wins",
        }
    ),
    "drops": frozenset(
        {
            "enabled",
            "capturesToHand",
            "mustDrop",
            "mustDropType",
            "dropLoop",
            "firstRankPawnDrops",
            "promotionZonePawnDrops",
            "regions",
            "enclosingRule",
            "enclosingStart",
            "sittuyinRook",
            "oppositeColoredBishop",
            "promoted",
            "noDoubledType",
            "noDoubledCount",
            "free",
        }
    ),
    "gating": frozenset({"enabled", "seirawan", "wallingRule", "wallingRegions", "wallOrMove"}),
    "gameEnd": frozenset(
        {
            "checking",
            "dropChecks",
            "kingType",
            "nMoveRule",
            "nMoveRuleTypes",
            "nFoldRule",
            "nFoldValue",
            "nFoldValueAbsolute",
            "perpetualCheckIllegal",
            "moveRepetitionIllegal",
            "chasingRule",
            "stalemateValue",
            "stalematePieceCount",
            "checkmateValue",
            "shogiPawnDropMateIllegal",
            "shatarMateRule",
            "bikjangRule",
            "dupleCheck",
            "checkCounting",
            "materialCounting",
            "adjudicateFullBoard",
            "countingRule",
        }
    ),
    "extinction": frozenset(
        {
            "value",
            "claim",
            "pseudoRoyal",
            "pieceTypes",
            "pieceCount",
            "opponentPieceCount",
        }
    ),
    "flag": frozenset({"pieces", "regions", "pieceCount", "blockedWin", "move", "safe"}),
    "connect": frozenset(
        {
            "n",
            "pieceTypes",
            "horizontal",
            "vertical",
            "diagonal",
            "region1",
            "region2",
            "nxn",
            "collinearN",
            "value",
        }
    ),
    "enclosing": frozenset({"flipRule"}),
}

REQUIRED_TOP_LEVEL = frozenset(
    {
        "schemaVersion",
        "name",
        "template",
        "board",
        "pieces",
        "pieceTypes",
        *REQUIRED_SECTIONS,
    }
)
REQUIRED_PIECE_FIELDS = frozenset({"type", "fen", "synonym", "customBetza", "value"})


def mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _missing_keys(value: Mapping[str, Any], required: Iterable[str]) -> list[str]:
    return sorted(set(required).difference(value))


def validate_fsf_variant_info(
    value: object,
    *,
    expected_name: str | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise FsfVariantInfoError("Fairy-Stockfish variant information must be an object.")

    missing = _missing_keys(value, REQUIRED_TOP_LEVEL)
    if missing:
        raise FsfVariantInfoError(
            "Incomplete Fairy-Stockfish variant information: missing " + ", ".join(missing)
        )
    if value.get("schemaVersion") != 1:
        raise FsfVariantInfoError("Unsupported Fairy-Stockfish variant information schema.")

    name = value.get("name")
    if not isinstance(name, str) or not name:
        raise FsfVariantInfoError("Invalid Fairy-Stockfish variant information name.")
    if expected_name is not None and name != expected_name:
        raise FsfVariantInfoError(
            f"Fairy-Stockfish variant information is for {name!r}, expected {expected_name!r}."
        )

    for section_name, required in REQUIRED_SECTIONS.items():
        section = value.get(section_name)
        if not isinstance(section, Mapping):
            raise FsfVariantInfoError(f"Invalid {section_name} section.")
        missing = _missing_keys(section, required)
        if missing:
            raise FsfVariantInfoError(f"incomplete {section_name}: missing " + ", ".join(missing))

    pieces = value.get("pieces")
    piece_types = value.get("pieceTypes")
    if not isinstance(pieces, list) or not isinstance(piece_types, list):
        raise FsfVariantInfoError("Invalid Fairy-Stockfish piece information.")
    for piece in pieces:
        if not isinstance(piece, Mapping) or _missing_keys(piece, REQUIRED_PIECE_FIELDS):
            raise FsfVariantInfoError("Incomplete Fairy-Stockfish piece information.")
        fen = piece.get("fen")
        if not isinstance(fen, Mapping) or _missing_keys(fen, ("white", "black")):
            raise FsfVariantInfoError("Incomplete Fairy-Stockfish piece FEN information.")

    return value


def parse_fsf_variant_info(
    raw: str | bytes | bytearray,
    *,
    expected_name: str | None = None,
) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise FsfVariantInfoError("Fairy-Stockfish returned invalid variant information.") from exc
    return validate_fsf_variant_info(value, expected_name=expected_name)


def _normal_role(value: object) -> str:
    role = str(value or "").strip().lower()
    return role if len(role) == 1 and role.isascii() and role.isalpha() else ""


def _ordered_unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def piece_type_roles_by_color(
    info: Mapping[str, Any],
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {"white": {}, "black": {}}
    pieces = info.get("pieces")
    if not isinstance(pieces, list):
        return result
    for raw_piece in pieces:
        piece = mapping(raw_piece)
        piece_type = str(piece.get("type") or "")
        fen = mapping(piece.get("fen"))
        if not piece_type:
            continue
        for color in ("white", "black"):
            role = _normal_role(fen.get(color))
            if role:
                result[color][piece_type] = role
    return result


def _piece_role_types_by_color(
    info: Mapping[str, Any],
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {"white": {}, "black": {}}
    pieces = info.get("pieces")
    if not isinstance(pieces, list):
        return result
    for raw_piece in pieces:
        piece = mapping(raw_piece)
        piece_type = str(piece.get("type") or "")
        fen = mapping(piece.get("fen"))
        synonym = mapping(piece.get("synonym"))
        for color in ("white", "black"):
            for raw_role in (fen.get(color), synonym.get(color)):
                role = _normal_role(raw_role)
                if piece_type and role:
                    result[color][role] = piece_type
    return result


@dataclass(frozen=True, slots=True)
class FenRoles:
    board: tuple[str, ...]
    board_promoted: tuple[str, ...]
    pocket: tuple[str, ...]
    pocket_promoted: tuple[str, ...]


def _fen_roles_by_color(start_fen: str) -> dict[str, FenRoles]:
    buckets: dict[str, dict[str, list[str]]] = {
        color: {
            "board": [],
            "board_promoted": [],
            "pocket": [],
            "pocket_promoted": [],
        }
        for color in ("white", "black")
    }
    board_and_pocket = start_fen.split(" ", 1)[0]
    in_pocket = False
    promoted = False
    for character in board_and_pocket:
        if character == "[":
            in_pocket = True
            promoted = False
            continue
        if character == "]":
            in_pocket = False
            promoted = False
            continue
        if character == "+":
            promoted = True
            continue
        if not character.isascii() or not character.isalpha():
            promoted = False
            continue
        color = "white" if character.isupper() else "black"
        bucket = "pocket" if in_pocket else "board"
        if promoted:
            bucket += "_promoted"
        buckets[color][bucket].append(character.lower())
        promoted = False

    return {
        color: FenRoles(
            tuple(_ordered_unique(values["board"])),
            tuple(_ordered_unique(values["board_promoted"])),
            tuple(_ordered_unique(values["pocket"])),
            tuple(_ordered_unique(values["pocket_promoted"])),
        )
        for color, values in buckets.items()
    }


def _color_values(value: object, color: str) -> list[str]:
    values = mapping(value).get(color)
    return [str(item) for item in values] if isinstance(values, list) else []


def _royal_piece_types(info: Mapping[str, Any]) -> set[str]:
    exported = info.get("royalPieceTypes")
    piece_types = {str(piece_type) for piece_type in info.get("pieceTypes", [])}
    royals = (
        {str(piece_type) for piece_type in exported}
        if isinstance(exported, list)
        else ({"king"} if "king" in piece_types else set())
    )
    extinction = mapping(info.get("extinction"))
    if bool(extinction.get("pseudoRoyal")):
        royals.update(str(piece_type) for piece_type in extinction.get("pieceTypes", []))
    return royals


@dataclass(frozen=True, slots=True)
class CataloguedVariantDerivedInfo:
    template: str
    start_fen: str
    width: int
    height: int
    pieces: list[str]
    king_roles: list[str]
    pocket_roles: list[str]
    capture_to_hand: bool
    promotion_type: str
    promotion_roles: list[str]
    promotion_order: list[str]
    show_promoted: bool
    rules_gate: bool
    rules_pass: bool
    legal_moves_need_history: bool
    n_fold_is_draw: bool
    show_check_counters: bool


def derive_catalogued_variant_info(
    info: Mapping[str, Any],
) -> CataloguedVariantDerivedInfo:
    board = mapping(info.get("board"))
    movement = mapping(info.get("movement"))
    promotion = mapping(info.get("promotion"))
    drops = mapping(info.get("drops"))
    gating = mapping(info.get("gating"))
    game_end = mapping(info.get("gameEnd"))
    type_roles = piece_type_roles_by_color(info)
    role_types = _piece_role_types_by_color(info)
    start_fen = str(board.get("startFen") or "")
    fen_roles = _fen_roles_by_color(start_fen)

    piece_roles: list[str] = []
    raw_pieces = info.get("pieces")
    if isinstance(raw_pieces, list):
        for raw_piece in reversed(raw_pieces):
            fen = mapping(mapping(raw_piece).get("fen"))
            piece_roles.extend(
                role for color in ("white", "black") if (role := _normal_role(fen.get(color)))
            )
    pieces = _ordered_unique(piece_roles)

    royal_types = _royal_piece_types(info)
    king_roles = _ordered_unique(
        type_roles[color].get(piece_type, "")
        for piece_type in royal_types
        for color in ("white", "black")
    )
    promoted_piece_types = mapping(promotion.get("promotedPieceTypes"))
    for source_type, target_type in promoted_piece_types.items():
        if str(target_type) not in royal_types:
            continue
        for color in ("white", "black"):
            source_role = type_roles[color].get(str(source_type))
            if source_role:
                king_roles.append(f"+{source_role}")
    king_roles = _ordered_unique(king_roles)

    explicit_pocket_roles = _ordered_unique(
        role
        for color in ("white", "black")
        for role in (*fen_roles[color].pocket, *fen_roles[color].pocket_promoted)
    )
    pocket_roles = list(explicit_pocket_roles)
    capture_to_hand = bool(drops.get("capturesToHand"))
    has_pocket = "[" in start_fen.split(" ", 1)[0]
    if bool(drops.get("enabled")) or has_pocket:
        if capture_to_hand and isinstance(raw_pieces, list):
            reachable_types: set[str] = set()
            for color in ("white", "black"):
                roles = (
                    *fen_roles[color].board,
                    *fen_roles[color].board_promoted,
                    *fen_roles[color].pocket,
                    *fen_roles[color].pocket_promoted,
                )
                reachable_types.update(
                    role_types[color][role] for role in roles if role in role_types[color]
                )
            for raw_piece in raw_pieces:
                piece = mapping(raw_piece)
                piece_type = str(piece.get("type") or "")
                if not piece_type or piece_type in royal_types or piece_type not in reachable_types:
                    continue
                role = _normal_role(mapping(piece.get("fen")).get("white"))
                if not role:
                    role = _normal_role(mapping(piece.get("fen")).get("black"))
                if role:
                    pocket_roles.append(role)
    else:
        pocket_roles = []
    pocket_roles = _ordered_unique(pocket_roles)

    shogi_promotion = bool(promotion.get("shogiStyle")) or bool(promoted_piece_types)
    if shogi_promotion:
        promotion_type = "shogi"
        promotion_source_types = [str(piece_type) for piece_type in promoted_piece_types]
        promotion_order = ["+", ""]
    else:
        promotion_type = "regular"
        promotion_source_types = _ordered_unique(
            [
                *_color_values(promotion.get("pawnTypes"), "white"),
                *_color_values(promotion.get("pawnTypes"), "black"),
            ]
        )
        promotion_order = _ordered_unique(
            type_roles[color].get(piece_type, "")
            for color in ("white", "black")
            for piece_type in _color_values(promotion.get("pieceTypes"), color)
        )
    promotion_roles = _ordered_unique(
        type_roles[color].get(piece_type, "")
        for piece_type in promotion_source_types
        for color in ("white", "black")
    )

    rules_pass = any(
        bool(mapping(movement.get(key)).get(color))
        for key in ("pass", "passOnStalemate")
        for color in ("white", "black")
    )
    legal_moves_need_history = rules_pass or any(
        bool(game_end.get(key))
        for key in ("perpetualCheckIllegal", "moveRepetitionIllegal", "bikjangRule")
    )
    n_fold_is_draw = (
        int(game_end.get("nFoldRule") or 0) > 0
        and str(game_end.get("nFoldValue") or "draw").casefold() == "draw"
    )
    show_promoted = (
        shogi_promotion
        or bool(promotion.get("demotion"))
        or bool(promotion.get("onCapture"))
        or bool(drops.get("promoted"))
        or "+" in start_fen.split(" ", 1)[0]
    )

    return CataloguedVariantDerivedInfo(
        template=str(info.get("template") or ""),
        start_fen=start_fen,
        width=int(board.get("width") or 0),
        height=int(board.get("height") or 0),
        pieces=pieces,
        king_roles=king_roles,
        pocket_roles=pocket_roles,
        capture_to_hand=capture_to_hand,
        promotion_type=promotion_type,
        promotion_roles=promotion_roles,
        promotion_order=promotion_order,
        show_promoted=show_promoted,
        rules_gate=bool(gating.get("seirawan")),
        rules_pass=rules_pass,
        legal_moves_need_history=legal_moves_need_history,
        n_fold_is_draw=n_fold_is_draw,
        show_check_counters=bool(game_end.get("checkCounting") or game_end.get("dupleCheck")),
    )


def catalogued_variant_derived_fields(info: Mapping[str, Any]) -> dict[str, Any]:
    derived = derive_catalogued_variant_info(info)
    return {
        "startFen": derived.start_fen,
        "width": derived.width,
        "height": derived.height,
        "pieces": derived.pieces,
        "kingRoles": derived.king_roles,
        "pocketRoles": derived.pocket_roles,
        "captureToHand": derived.capture_to_hand,
        "promotionType": derived.promotion_type,
        "promotionRoles": derived.promotion_roles,
        "promotionOrder": derived.promotion_order,
        "showPromoted": derived.show_promoted,
        "rulesGate": derived.rules_gate,
        "rulesPass": derived.rules_pass,
        "legalMovesNeedHistory": derived.legal_moves_need_history,
        "nFoldIsDraw": derived.n_fold_is_draw,
        "showCheckCounters": derived.show_check_counters,
        "fsfVariantInfo": dict(info),
    }
