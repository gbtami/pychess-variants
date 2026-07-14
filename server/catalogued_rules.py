from __future__ import annotations

# fmt: off
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import lru_cache
import json
import re
from typing import Any, Mapping, NotRequired, TypedDict


class CataloguedRuleLine(TypedDict):
    text: str
    technical: str


class CataloguedRuleSection(TypedDict):
    title: str
    lines: list[CataloguedRuleLine]
    kind: NotRequired[str]


class CataloguedRuleSummary(TypedDict):
    intro: list[str]
    sections: list[CataloguedRuleSection]
    unknown: list[CataloguedRuleLine]


RULE_SUMMARY_CACHE_SIZE = 512
RULE_SUMMARY_GENERATOR_VERSION = 2


@dataclass
class ParsedCataloguedIni:
    name: str = ""
    parent: str = ""
    options: dict[str, list[tuple[str, str]]] = field(default_factory=dict)

    def option(self, key: str) -> str | None:
        values = self.options.get(key.casefold())
        if not values:
            return None
        return values[-1][1]

    def option_name(self, key: str) -> str:
        values = self.options.get(key.casefold())
        if not values:
            return key
        return values[-1][0]

    def has(self, key: str) -> bool:
        return key.casefold() in self.options

    def items(self) -> list[tuple[str, str]]:
        result: list[tuple[str, str]] = []
        for entries in self.options.values():
            result.extend(entries)
        return result


PIECE_OPTION_NAMES: dict[str, str] = {
    "pawn": "pawn",
    "knight": "knight",
    "bishop": "bishop",
    "rook": "rook",
    "queen": "queen",
    "fers": "fers",
    "alfil": "alfil",
    "fersalfil": "fers-alfil",
    "silver": "silver",
    "aiwok": "ai-wok",
    "bers": "bers",
    "archbishop": "archbishop",
    "chancellor": "chancellor",
    "amazon": "amazon",
    "knibis": "knibis",
    "biskni": "biskni",
    "kniroo": "kni-rook",
    "rookni": "rook-knight",
    "shogipawn": "shogi pawn",
    "lance": "lance",
    "shogiknight": "shogi knight",
    "gold": "gold",
    "dragonhorse": "dragon horse",
    "clobber": "clobber",
    "breakthrough": "breakthrough pawn",
    "immobile": "immobile piece",
    "cannon": "cannon",
    "janggicannon": "janggi cannon",
    "soldier": "soldier",
    "horse": "horse",
    "elephant": "elephant",
    "janggieelephant": "janggi elephant",
    "janggielephant": "janggi elephant",
    "banner": "banner",
    "wazir": "wazir",
    "commoner": "commoner",
    "centaur": "centaur",
    "king": "king",
}

BOOLEAN_OPTIONS = {
    "chess960",
    "twoboards",
    "sittuyinpromotion",
    "piecepromotiononcapture",
    "mandatorypawnpromotion",
    "mandatorypiecepromotion",
    "piecedemotion",
    "blastoncapture",
    "petrifyblastpieces",
    "doublestep",
    "castling",
    "castlingdroppedpiece",
    "oppositecastling",
    "checking",
    "dropchecks",
    "mustcapture",
    "mustdrop",
    "piecedrops",
    "droploop",
    "capturestohand",
    "firstrankpawndrops",
    "promotionzonepawndrops",
    "sittuyinrookdrop",
    "dropoppositecoloredbishop",
    "droppromoted",
    "immobilityillegal",
    "gating",
    "wallormove",
    "seirawangating",
    "cambodianmoves",
    "pass",
    "passwhite",
    "passblack",
    "passonstalemate",
    "passonstalematewhite",
    "passonstalemateblack",
    "makpongrule",
    "flyinggeneral",
    "nfoldvalueabsolute",
    "perpetualcheckillegal",
    "moverepeatillegal",
    "moverepetitionillegal",
    "stalematepiececount",
    "shogipawndropmateillegal",
    "shatarmaterule",
    "bikjangrule",
    "extinctionclaim",
    "extinctionpseudoroyal",
    "duplecheck",
    "flagpieceblockedwin",
    "flagmove",
    "flagpiecesafe",
    "checkcounting",
    "connectvertical",
    "connecthorizontal",
    "connectdiagonal",
    "adjudicatefullboard",
}

KNOWN_OPTIONS = {
    "varianttemplate",
    "piecetochartable",
    "pocketsize",
    "maxrank",
    "maxfile",
    "startfen",
    "mobilityregion",
    "pawntypes",
    "promotionregion",
    "promotionregionwhite",
    "promotionregionblack",
    "promotionpawntypes",
    "promotionpawntypeswhite",
    "promotionpawntypesblack",
    "promotionpiecetypes",
    "promotionpiecetypeswhite",
    "promotionpiecetypesblack",
    "promotionlimit",
    "promotedpiecetype",
    "blastimmunetypes",
    "mutuallyimmunetypes",
    "petrifyoncapturetypes",
    "doublestepregionwhite",
    "doublestepregionblack",
    "triplestepregionwhite",
    "triplestepregionblack",
    "enpassantregion",
    "enpassantregionwhite",
    "enpassantregionblack",
    "enpassanttypes",
    "enpassanttypeswhite",
    "enpassanttypesblack",
    "castlingkingsidefile",
    "castlingqueensidefile",
    "castlingrank",
    "castlingkingfile",
    "castlingkingpiece",
    "castlingrookkingsidefile",
    "castlingrookqueensidefile",
    "castlingrookpieces",
    "mustdroptype",
    "enclosingdrop",
    "enclosingdropstart",
    "dropregion",
    "dropregionwhite",
    "dropregionblack",
    "dropnodoubled",
    "dropnodoubledcount",
    "wallingrule",
    "wallingregion",
    "wallingregionwhite",
    "wallingregionblack",
    "diagonallines",
    "soldierpromotionrank",
    "flipenclosedpieces",
    "nmoveruletypes",
    "nmoveruletypeswhite",
    "nmoveruletypesblack",
    "nmoverule",
    "nfoldrule",
    "nfoldvalue",
    "chasingrule",
    "stalematevalue",
    "checkmatevalue",
    "extinctionvalue",
    "extinctionpiecetypes",
    "extinctionpiececount",
    "extinctionopponentpiececount",
    "flagpiece",
    "flagpiecewhite",
    "flagpieceblack",
    "flagregion",
    "flagregionwhite",
    "flagregionblack",
    "flagpiececount",
    "connectn",
    "connectpiecetypes",
    "connectregion1white",
    "connectregion2white",
    "connectregion1black",
    "connectregion2black",
    "connectnxn",
    "collinearn",
    "connectvalue",
    "materialcounting",
    "countingrule",
    "castlingwins",
    "piecevaluemg",
    "piecevalueeg",
} | BOOLEAN_OPTIONS | set(PIECE_OPTION_NAMES)


def _strip_inline_comment(line: str) -> str:
    # Fairy-Stockfish examples use # for comments and not inside option values.
    return line.split("#", 1)[0].strip()


def parse_catalogued_ini(ini: str) -> ParsedCataloguedIni:
    parsed = ParsedCataloguedIni()
    inside_section = False

    for raw_line in ini.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("[") and "]" in line:
            body = line[1 : line.index("]")].strip()
            name, separator, parent = body.partition(":")
            parsed.name = name.strip()
            parsed.parent = parent.strip() if separator else ""
            inside_section = True
            continue

        if not inside_section or "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = _strip_inline_comment(raw_value)
        if not key:
            continue
        parsed.options.setdefault(key.casefold(), []).append((key, value))

    return parsed


def _bool_value(value: str | None) -> bool:
    return str(value or "").strip().casefold() in {"true", "yes", "1", "on"}


def _negative_bool_value(value: str | None) -> bool:
    return str(value or "").strip().casefold() in {"false", "no", "0", "off"}


def _join_values(values: list[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    return ", ".join(values[:-1]) + " and " + values[-1]


def _piece_code_text(value: str) -> str:
    value = value.strip()
    return "any piece" if value in {"*", ""} else f"piece(s) {value}"


def _natural_join(items: list[str], *, separator: str = ", ") -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return f"{separator.join(items[:-1])} and {items[-1]}"


def _range_text(values: list[str]) -> str | None:
    if not values:
        return None
    if all(value.isdigit() for value in values):
        numbers = [int(value) for value in values]
        if len(numbers) == 1:
            return str(numbers[0])
        step = 1 if numbers[-1] >= numbers[0] else -1
        if numbers == list(range(numbers[0], numbers[-1] + step, step)):
            return f"{numbers[0]} to {numbers[-1]}"
    return _natural_join(values)


def _region_text(value: str | None) -> str:
    region = str(value or "").strip()
    if not region or region == "-":
        return "no squares"
    if region == "*":
        return "the whole board"

    tokens = [token for token in re.split(r"\s+", region) if token]
    rank_wildcards = [token[1:] for token in tokens if re.fullmatch(r"\*\d+", token)]
    file_wildcards = [token[:-1] for token in tokens if re.fullmatch(r"[A-Za-z]+\*", token)]

    if len(rank_wildcards) == len(tokens):
        range_text = _range_text(rank_wildcards)
        if not range_text:
            return region
        if len(rank_wildcards) == 1:
            return f"all squares on rank {range_text}"
        if " to " in range_text:
            return f"all the ranks from {range_text}"
        return f"all squares on ranks {range_text}"

    if len(file_wildcards) == len(tokens):
        files = _natural_join(file_wildcards)
        if len(file_wildcards) == 1:
            return f"all squares on file {files}"
        return f"all squares on files {files}"

    square_tokens = [token for token in tokens if re.fullmatch(r"[A-Za-z]+\d+", token)]
    if len(square_tokens) == len(tokens):
        return f"squares {_natural_join(square_tokens)}"

    return f"the configured region `{region}`"


def _side_specific_option(parsed: ParsedCataloguedIni, base_key: str, side: str) -> str | None:
    color_key = f"{base_key}{side}"
    value = parsed.option(color_key)
    if value is not None:
        return value

    combined = parsed.option(base_key)
    if not combined:
        return None

    # Some UIs normalize color-specific Fairy-Stockfish options to a compact
    # display such as "white: *1 *2, black: *8 *9". Accept that form too.
    matches = re.finditer(
        r"(?:^|,)\s*(white|black)\s*:\s*(.*?)(?=\s*,\s*(?:white|black)\s*:|$)",
        combined,
        flags=re.IGNORECASE,
    )
    wanted = side.casefold()
    for match in matches:
        if match.group(1).casefold() == wanted:
            return match.group(2).strip()
    return None


def _side_region_sentence(subject: str, white_region: str | None, black_region: str | None) -> str:
    parts: list[str] = []
    if white_region is not None:
        parts.append(f"the {subject} for White is {_region_text(white_region)}")
    if black_region is not None:
        parts.append(f"the {subject} for Black is {_region_text(black_region)}")
    if not parts:
        return ""
    return f"The {_natural_join(parts)}."


def _piece_name_map(parsed: ParsedCataloguedIni) -> dict[str, str]:
    names: dict[str, str] = {
        "p": "pawn",
        "n": "knight",
        "b": "bishop",
        "r": "rook",
        "q": "queen",
        "k": "king",
    }

    for key, value in parsed.items():
        lowered = key.casefold()
        if lowered.startswith("custompiece"):
            label = f"custom piece {key[len('customPiece'):] or ''}".strip()
        elif lowered in PIECE_OPTION_NAMES:
            label = PIECE_OPTION_NAMES[lowered]
        else:
            continue

        definition = value.strip()
        if not definition or definition == "-":
            continue
        letter = definition.split(":", 1)[0].strip().lower()
        if len(letter) == 1 and letter.isalpha():
            names[letter] = label

    return names


def _named_piece_list(value: str, names: Mapping[str, str]) -> str:
    pieces: list[str] = []
    for letter in value.replace(" ", ""):
        lowered = letter.lower()
        if not lowered.isalpha() or lowered in pieces:
            continue
        pieces.append(lowered)
    if not pieces:
        return "no pieces"
    return _join_values([f"{names.get(piece, 'piece')} ({piece})" for piece in pieces])


def _value_result_text(value: str | None, *, default: str) -> str:
    normalized = str(value or default).strip().casefold()
    if normalized == "win":
        return "a win for the side to move"
    if normalized == "loss":
        return "a loss for the side to move"
    if normalized == "draw":
        return "a draw"
    if normalized == "none":
        return "no automatic result"
    return normalized or default


def _technical(key: str, value: Any) -> str:
    return f"{key} = {value}"


def _add(lines: list[CataloguedRuleLine], text: str, key: str, value: Any) -> None:
    lines.append({"text": text, "technical": _technical(key, value)})


def _board_setup_lines(parsed: ParsedCataloguedIni, doc: Mapping[str, Any]) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []

    if _bool_value(parsed.option("chess960")):
        _add(lines, "The variant supports Chess960-style randomized starting positions/castling.", "chess960", "true")

    if _bool_value(parsed.option("twoBoards")):
        _add(lines, "Pocket pieces can arrive from another board, as in bughouse-style variants.", "twoBoards", "true")

    if parsed.has("gating") and _bool_value(parsed.option("gating")):
        _add(lines, "The FEN castling-rights field is also used to track extra setup or gating rights.", "gating", "true")

    if parsed.has("seirawanGating") and _bool_value(parsed.option("seirawanGating")):
        _add(lines, "Pieces in hand may be gated onto the board in the Seirawan/S-Chess style.", "seirawanGating", "true")

    if parsed.has("cambodianMoves") and _bool_value(parsed.option("cambodianMoves")):
        _add(lines, "Cambodian/Ouk Chatrang special opening moves are enabled.", "cambodianMoves", "true")

    return lines


def _piece_lines(parsed: ParsedCataloguedIni, doc: Mapping[str, Any]) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []
    names = _piece_name_map(parsed)
    pieces = [str(piece).lower() for piece in doc.get("pieces") or []]
    if pieces:
        _add(
            lines,
            f"The piece set used on the board is: {_join_values([f'{names.get(piece, 'piece')} ({piece})' for piece in pieces])}.",
            "pieces",
            "".join(pieces),
        )

    for key, value in parsed.items():
        lowered = key.casefold()
        if lowered.startswith("custompiece") and value.strip() and value.strip() != "-":
            letter, _, betza = value.partition(":")
            if betza.strip():
                _add(
                    lines,
                    f"Piece {letter.strip()} is a custom piece with Betza movement `{betza.strip()}`.",
                    key,
                    value,
                )
        elif lowered == "king" and ":" in value:
            letter, _, betza = value.partition(":")
            _add(lines, f"The royal piece {letter.strip()} uses custom Betza movement `{betza.strip()}`.", key, value)

    for key, value in parsed.items():
        lowered = key.casefold()
        if lowered.startswith("mobilityregion"):
            _add(lines, f"Some pieces have restricted movement regions: {key} is {value}.", key, value)

    if parsed.has("diagonalLines"):
        _add(lines, "Special diagonal palace lines are enabled on selected squares.", "diagonalLines", parsed.option("diagonalLines"))

    if parsed.has("soldierPromotionRank"):
        _add(
            lines,
            "Soldiers use restricted pawn-like movement until they reach the configured promotion rank.",
            "soldierPromotionRank",
            parsed.option("soldierPromotionRank"),
        )

    return lines


def _move_rule_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []

    if parsed.has("checking") and _negative_bool_value(parsed.option("checking")):
        _add(lines, "Check restrictions are disabled; kings/royal pieces may be capturable depending on the variant goal.", "checking", "false")

    if parsed.has("castling"):
        if _bool_value(parsed.option("castling")):
            _add(lines, "Castling is allowed.", "castling", parsed.option("castling"))
        elif _negative_bool_value(parsed.option("castling")):
            _add(lines, "Castling is not allowed.", "castling", parsed.option("castling"))

    if parsed.has("oppositeCastling") and _bool_value(parsed.option("oppositeCastling")):
        _add(lines, "A player may not castle on the same side as the opponent.", "oppositeCastling", "true")

    if parsed.has("castlingDroppedPiece") and _bool_value(parsed.option("castlingDroppedPiece")):
        _add(lines, "Dropped rooks or royal pieces may still participate in castling.", "castlingDroppedPiece", "true")

    if parsed.has("doubleStep"):
        if _negative_bool_value(parsed.option("doubleStep")):
            _add(lines, "Pawn double-step moves are disabled.", "doubleStep", parsed.option("doubleStep"))
        elif _bool_value(parsed.option("doubleStep")):
            _add(lines, "Pawn double-step moves are enabled.", "doubleStep", parsed.option("doubleStep"))

    if parsed.has("tripleStepRegionWhite") or parsed.has("tripleStepRegionBlack"):
        _add(
            lines,
            "Some pawns may make a triple-step move from the configured starting regions.",
            "tripleStepRegion",
            f"white: {parsed.option('tripleStepRegionWhite') or '-'}, black: {parsed.option('tripleStepRegionBlack') or '-'}",
        )

    if parsed.has("enPassantRegion") or parsed.has("enPassantRegionWhite") or parsed.has("enPassantRegionBlack"):
        _add(lines, "En passant is restricted to the configured target region.", "enPassantRegion", parsed.option("enPassantRegion") or "color-specific")

    if parsed.has("mustCapture") and _bool_value(parsed.option("mustCapture")):
        _add(lines, "Captures are mandatory when available, except that legal check evasion still has priority.", "mustCapture", "true")

    if parsed.has("mustDrop") and _bool_value(parsed.option("mustDrop")):
        piece = parsed.option("mustDropType") or "*"
        _add(lines, f"Dropping {_piece_code_text(piece)} is mandatory when possible.", "mustDrop", "true")

    if parsed.has("pass") and _bool_value(parsed.option("pass")):
        _add(lines, "Players may pass their turn.", "pass", "true")
    if any(_bool_value(parsed.option(key)) for key in ("passWhite", "passBlack")):
        sides = [side for side, key in (("White", "passWhite"), ("Black", "passBlack")) if _bool_value(parsed.option(key))]
        _add(lines, f"{_join_values(sides)} may pass their turn.", "passWhite/passBlack", ", ".join(sides))

    if parsed.has("passOnStalemate") and _bool_value(parsed.option("passOnStalemate")):
        _add(lines, "A stalemated player may pass instead of the game ending immediately.", "passOnStalemate", "true")

    if parsed.has("makpongRule") and _bool_value(parsed.option("makpongRule")):
        _add(lines, "The king may not move away from check under the Makpong rule.", "makpongRule", "true")

    if parsed.has("flyingGeneral") and _bool_value(parsed.option("flyingGeneral")):
        _add(lines, "Facing generals/kings on the same open file are illegal, as in Xiangqi.", "flyingGeneral", "true")

    if parsed.has("immobilityIllegal") and _bool_value(parsed.option("immobilityIllegal")):
        _add(lines, "A piece may not move to a square where it would have no legal future movement.", "immobilityIllegal", "true")

    return lines


def _drop_lines(parsed: ParsedCataloguedIni, doc: Mapping[str, Any]) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []
    names = _piece_name_map(parsed)
    pocket_roles = [str(piece).lower() for piece in doc.get("pocketRoles") or []]
    piece_drops = _bool_value(parsed.option("pieceDrops")) or bool(pocket_roles)
    captures_to_hand = bool(doc.get("captureToHand", _bool_value(parsed.option("capturesToHand"))))

    if piece_drops:
        if pocket_roles:
            text = f"Pieces in hand can be dropped back onto the board. Droppable pieces are: {_join_values([f'{names.get(piece, 'piece')} ({piece})' for piece in pocket_roles])}."
        else:
            text = "Pieces in hand can be dropped back onto the board."
        _add(lines, text, "pieceDrops", "true")

    if captures_to_hand:
        _add(lines, "Captured pieces go to the capturer's hand.", "capturesToHand", "true")

    if parsed.has("twoBoards") and _bool_value(parsed.option("twoBoards")):
        _add(lines, "Hands may receive pieces from a partner board rather than only from local captures.", "twoBoards", "true")

    if parsed.has("dropChecks") and _negative_bool_value(parsed.option("dropChecks")):
        _add(lines, "Drops may not give immediate check.", "dropChecks", "false")

    if parsed.has("dropNoDoubled") and (parsed.option("dropNoDoubled") or "").strip() not in {"", "-"}:
        value = parsed.option("dropNoDoubled") or ""
        count = parsed.option("dropNoDoubledCount") or "1"
        _add(lines, f"Drops of {_named_piece_list(value, names)} are restricted on files that already contain {count} such piece(s).", "dropNoDoubled", value)

    if parsed.has("firstRankPawnDrops") and _bool_value(parsed.option("firstRankPawnDrops")):
        _add(lines, "Pawn drops on the first rank are allowed.", "firstRankPawnDrops", "true")

    if parsed.has("promotionZonePawnDrops") and _bool_value(parsed.option("promotionZonePawnDrops")):
        _add(lines, "Pawn drops into the promotion zone are allowed.", "promotionZonePawnDrops", "true")

    if parsed.has("dropPromoted") and _bool_value(parsed.option("dropPromoted")):
        _add(lines, "Pieces may be dropped in their promoted form.", "dropPromoted", "true")

    if parsed.has("dropLoop") and _bool_value(parsed.option("dropLoop")):
        _add(lines, "Captured promoted pieces stay promoted when they go to hand.", "dropLoop", "true")

    if parsed.has("sittuyinRookDrop") and _bool_value(parsed.option("sittuyinRookDrop")):
        _add(lines, "Rook drops are restricted to the first rank.", "sittuyinRookDrop", "true")

    if parsed.has("dropOppositeColoredBishop") and _bool_value(parsed.option("dropOppositeColoredBishop")):
        _add(lines, "Dropped bishops must be placed on opposite-colored squares.", "dropOppositeColoredBishop", "true")

    white_drop_region = _side_specific_option(parsed, "dropRegion", "White")
    black_drop_region = _side_specific_option(parsed, "dropRegion", "Black")
    if white_drop_region is not None or black_drop_region is not None:
        region_text = _side_region_sentence("drop region", white_drop_region, black_drop_region)
        _add(
            lines,
            f"Piece drops are restricted to color-specific board regions. {region_text}".strip(),
            "dropRegion",
            f"white: {white_drop_region or '-'}, black: {black_drop_region or '-'}",
        )

    if parsed.has("enclosingDrop") and (parsed.option("enclosingDrop") or "none").casefold() != "none":
        _add(lines, "Drops must satisfy an enclosing/placement rule before they are legal.", "enclosingDrop", parsed.option("enclosingDrop"))

    if parsed.has("shogiPawnDropMateIllegal") and _bool_value(parsed.option("shogiPawnDropMateIllegal")):
        _add(lines, "Checkmate by dropping a shogi pawn is illegal.", "shogiPawnDropMateIllegal", "true")

    return lines


def _promotion_lines(parsed: ParsedCataloguedIni, doc: Mapping[str, Any]) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []
    names = _piece_name_map(parsed)
    promotion_roles = [str(piece).lower() for piece in doc.get("promotionRoles") or []]

    white_promotion_region = _side_specific_option(parsed, "promotionRegion", "White")
    black_promotion_region = _side_specific_option(parsed, "promotionRegion", "Black")
    if white_promotion_region is not None or black_promotion_region is not None:
        region_text = _side_region_sentence("promotion region", white_promotion_region, black_promotion_region)
        _add(
            lines,
            f"Promotions are available in the configured promotion zones. {region_text}".strip(),
            "promotionRegion",
            f"white: {white_promotion_region or '-'}, black: {black_promotion_region or '-'}",
        )

    if promotion_roles:
        _add(
            lines,
            f"The pieces that can promote are: {_join_values([f'{names.get(piece, 'piece')} ({piece})' for piece in promotion_roles])}.",
            "promotionRoles",
            "".join(promotion_roles),
        )

    if parsed.has("promotionPieceTypes") or parsed.has("promotionPieceTypesWhite") or parsed.has("promotionPieceTypesBlack"):
        values = []
        if parsed.has("promotionPieceTypes"):
            values.append(f"both sides: {_named_piece_list(parsed.option('promotionPieceTypes') or '', names)}")
        if parsed.has("promotionPieceTypesWhite"):
            values.append(f"White: {_named_piece_list(parsed.option('promotionPieceTypesWhite') or '', names)}")
        if parsed.has("promotionPieceTypesBlack"):
            values.append(f"Black: {_named_piece_list(parsed.option('promotionPieceTypesBlack') or '', names)}")
        _add(lines, f"Promotion choices are {_join_values(values)}.", "promotionPieceTypes", "; ".join(values))

    if parsed.has("promotedPieceType") and (parsed.option("promotedPieceType") or "").strip():
        mappings = []
        for token in (parsed.option("promotedPieceType") or "").split():
            source, separator, target = token.partition(":")
            if separator:
                mappings.append(f"{source} promotes to {target}")
        if mappings:
            _add(lines, f"Fixed promotion mappings: {_join_values(mappings)}.", "promotedPieceType", parsed.option("promotedPieceType"))

    if parsed.has("mandatoryPawnPromotion"):
        if _bool_value(parsed.option("mandatoryPawnPromotion")):
            _add(lines, "Pawn promotion is mandatory when a pawn reaches the last rank/required zone.", "mandatoryPawnPromotion", parsed.option("mandatoryPawnPromotion"))
        elif _negative_bool_value(parsed.option("mandatoryPawnPromotion")):
            _add(lines, "Pawn promotion is optional where promotion is legal.", "mandatoryPawnPromotion", parsed.option("mandatoryPawnPromotion"))

    if parsed.has("mandatoryPiecePromotion") and _bool_value(parsed.option("mandatoryPiecePromotion")):
        _add(lines, "Piece promotion is mandatory where promotion is legal.", "mandatoryPiecePromotion", "true")

    if parsed.has("piecePromotionOnCapture") and _bool_value(parsed.option("piecePromotionOnCapture")):
        _add(lines, "Piece promotion is only allowed when the move captures.", "piecePromotionOnCapture", "true")

    if parsed.has("pieceDemotion") and _bool_value(parsed.option("pieceDemotion")):
        _add(lines, "Promoted pieces can demote according to the configured promotion mapping.", "pieceDemotion", "true")

    if parsed.has("sittuyinPromotion") and _bool_value(parsed.option("sittuyinPromotion")):
        _add(lines, "Sittuyin-style promotion rules are enabled.", "sittuyinPromotion", "true")

    if parsed.has("promotionLimit") and (parsed.option("promotionLimit") or "").strip():
        _add(lines, "The number of promoted pieces of some types is limited.", "promotionLimit", parsed.option("promotionLimit"))

    return lines


def _capture_effect_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []

    if parsed.has("blastOnCapture") and _bool_value(parsed.option("blastOnCapture")):
        _add(lines, "Captures cause an atomic-style explosion around the capture square.", "blastOnCapture", "true")

    if parsed.has("blastImmuneTypes") and (parsed.option("blastImmuneTypes") or "").strip().casefold() not in {"", "none", "-"}:
        _add(lines, "Some piece types are immune to explosions.", "blastImmuneTypes", parsed.option("blastImmuneTypes"))

    if parsed.has("mutuallyImmuneTypes") and (parsed.option("mutuallyImmuneTypes") or "").strip().casefold() not in {"", "none", "-"}:
        _add(lines, "Some piece types cannot capture matching immune pieces.", "mutuallyImmuneTypes", parsed.option("mutuallyImmuneTypes"))

    if parsed.has("petrifyOnCaptureTypes") and (parsed.option("petrifyOnCaptureTypes") or "").strip().casefold() not in {"", "none", "-"}:
        _add(lines, "Some capturing pieces turn into walls after capturing.", "petrifyOnCaptureTypes", parsed.option("petrifyOnCaptureTypes"))

    if parsed.has("petrifyBlastPieces") and _bool_value(parsed.option("petrifyBlastPieces")):
        _add(lines, "Pieces destroyed by a combined petrify/explosion effect also become walls.", "petrifyBlastPieces", "true")

    if parsed.has("flipEnclosedPieces") and (parsed.option("flipEnclosedPieces") or "none").casefold() != "none":
        _add(lines, "Enclosed pieces change color after certain drops or moves.", "flipEnclosedPieces", parsed.option("flipEnclosedPieces"))

    return lines


def _wall_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []
    walling_rule = (parsed.option("wallingRule") or "none").strip().casefold()
    if walling_rule and walling_rule != "none":
        if walling_rule == "duck":
            text = "After a move, a duck-like blocker is placed according to the walling rule."
        elif walling_rule == "arrow":
            text = "Moves may create arrow-style wall squares, as in Amazons-like games."
        elif walling_rule == "past":
            text = "The square a piece leaves can become blocked, as in Snailtrail-like games."
        elif walling_rule == "static":
            text = "Some squares are static walls."
        else:
            text = f"The variant uses the `{walling_rule}` wall-placement rule."
        _add(lines, text, "wallingRule", parsed.option("wallingRule"))

    if parsed.has("wallOrMove") and _bool_value(parsed.option("wallOrMove")):
        _add(lines, "A turn may consist of either placing a wall or moving a piece, but not both.", "wallOrMove", "true")

    white_walling_region = _side_specific_option(parsed, "wallingRegion", "White")
    black_walling_region = _side_specific_option(parsed, "wallingRegion", "Black")
    if white_walling_region is not None or black_walling_region is not None:
        region_text = _side_region_sentence("walling region", white_walling_region, black_walling_region)
        _add(
            lines,
            f"Wall placement is restricted to color-specific regions. {region_text}".strip(),
            "wallingRegion",
            f"white: {white_walling_region or '-'}, black: {black_walling_region or '-'}",
        )

    return lines


def _ending_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []

    if parsed.has("checkCounting") and _bool_value(parsed.option("checkCounting")):
        _add(lines, "The game tracks checks as a win condition, as in Three-check style variants.", "checkCounting", "true")

    if parsed.has("extinctionValue") and (parsed.option("extinctionValue") or "none").casefold() != "none":
        value = _value_result_text(parsed.option("extinctionValue"), default="none")
        piece_types = parsed.option("extinctionPieceTypes") or "configured pieces"
        count = parsed.option("extinctionPieceCount") or "0"
        claim_text = " The ending is claimable." if _bool_value(parsed.option("extinctionClaim")) else ""
        _add(lines, f"An extinction rule is active: reaching {count} remaining {_piece_code_text(piece_types)} causes {value}.{claim_text}", "extinctionValue", parsed.option("extinctionValue"))

    if parsed.has("flagRegion") or parsed.has("flagRegionWhite") or parsed.has("flagRegionBlack"):
        piece = parsed.option("flagPiece") or parsed.option("flagPieceWhite") or parsed.option("flagPieceBlack") or "*"
        _add(lines, f"A flag/goal-zone win is active for {_piece_code_text(piece)}.", "flagRegion", parsed.option("flagRegion") or "color-specific")

    if parsed.has("connectN") and str(parsed.option("connectN") or "0").isdigit() and int(parsed.option("connectN") or "0") > 0:
        directions = []
        if not parsed.has("connectHorizontal") or _bool_value(parsed.option("connectHorizontal")):
            directions.append("horizontally")
        if not parsed.has("connectVertical") or _bool_value(parsed.option("connectVertical")):
            directions.append("vertically")
        if not parsed.has("connectDiagonal") or _bool_value(parsed.option("connectDiagonal")):
            directions.append("diagonally")
        _add(lines, f"A player can win by connecting {parsed.option('connectN')} pieces {_join_values(directions)}.", "connectN", parsed.option("connectN"))

    if parsed.has("connectNxN") and str(parsed.option("connectNxN") or "0").isdigit() and int(parsed.option("connectNxN") or "0") > 0:
        _add(lines, f"A player can win by forming a tight {parsed.option('connectNxN')}×{parsed.option('connectNxN')} block of pieces.", "connectNxN", parsed.option("connectNxN"))

    if parsed.has("collinearN") and str(parsed.option("collinearN") or "0").isdigit() and int(parsed.option("collinearN") or "0") > 0:
        _add(lines, f"A player can win by arranging {parsed.option('collinearN')} pieces on one line.", "collinearN", parsed.option("collinearN"))

    if parsed.has("castlingWins") and (parsed.option("castlingWins") or "-").strip() not in {"", "-"}:
        _add(lines, "Some castling rights are win conditions; losing those rights loses the opportunity or the game according to the engine rule.", "castlingWins", parsed.option("castlingWins"))

    if parsed.has("stalemateValue"):
        _add(lines, f"Stalemate is scored as {_value_result_text(parsed.option('stalemateValue'), default='draw')}.", "stalemateValue", parsed.option("stalemateValue"))

    if parsed.has("checkmateValue"):
        _add(lines, f"Checkmate is scored as {_value_result_text(parsed.option('checkmateValue'), default='loss')}.", "checkmateValue", parsed.option("checkmateValue"))

    if parsed.has("shatarMateRule") and _bool_value(parsed.option("shatarMateRule")):
        _add(lines, "Shatar-specific mating rules are enabled.", "shatarMateRule", "true")

    if parsed.has("bikjangRule") and _bool_value(parsed.option("bikjangRule")):
        _add(lines, "The Janggi bikjang/facing-kings rule is considered for the game result.", "bikjangRule", "true")

    return lines


def _draw_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    lines: list[CataloguedRuleLine] = []

    if parsed.has("nMoveRule"):
        value = parsed.option("nMoveRule") or "0"
        if value == "0":
            _add(lines, "There is no automatic n-move/50-move draw rule.", "nMoveRule", value)
        else:
            _add(lines, f"The n-move rule is set to {value} moves.", "nMoveRule", value)

    if parsed.has("nFoldRule"):
        value = parsed.option("nFoldRule") or "3"
        result = _value_result_text(parsed.option("nFoldValue"), default="draw")
        _add(lines, f"Position repetition is adjudicated after {value}-fold repetition as {result}.", "nFoldRule", value)

    if parsed.has("perpetualCheckIllegal") and _bool_value(parsed.option("perpetualCheckIllegal")):
        _add(lines, "Perpetual check is illegal.", "perpetualCheckIllegal", "true")

    if parsed.has("moveRepetitionIllegal") and _bool_value(parsed.option("moveRepetitionIllegal")):
        _add(lines, "Repeating back-and-forth moves with the same piece is illegal.", "moveRepetitionIllegal", "true")

    if parsed.has("chasingRule") and (parsed.option("chasingRule") or "none").casefold() != "none":
        _add(lines, "Xiangqi-style chasing rules are enabled.", "chasingRule", parsed.option("chasingRule"))

    if parsed.has("materialCounting") and (parsed.option("materialCounting") or "none").casefold() != "none":
        _add(lines, "Material counting adjudication is enabled.", "materialCounting", parsed.option("materialCounting"))

    if parsed.has("countingRule") and (parsed.option("countingRule") or "none").casefold() != "none":
        _add(lines, "Regional counting rules are enabled for the endgame.", "countingRule", parsed.option("countingRule"))

    if parsed.has("adjudicateFullBoard") and _bool_value(parsed.option("adjudicateFullBoard")):
        _add(lines, "Material counting is applied immediately when the board is full.", "adjudicateFullBoard", "true")

    return lines


def _unknown_lines(parsed: ParsedCataloguedIni) -> list[CataloguedRuleLine]:
    unknown: list[CataloguedRuleLine] = []
    for key, value in parsed.items():
        lowered = key.casefold()
        if lowered.startswith("custompiece"):
            continue
        if lowered.startswith("mobilityregion"):
            continue
        if lowered.startswith("piecevalue"):
            continue
        if lowered not in KNOWN_OPTIONS:
            unknown.append({"text": f"{key} is set to {value}.", "technical": _technical(key, value)})
    return unknown


def _string_tuple(value: object) -> tuple[str, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, Iterable):
        return tuple(str(item) for item in value)
    return (str(value),)


def _int_cache_value(value: object) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, (float, str)):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0


def _optional_bool_cache_value(doc: Mapping[str, Any], key: str) -> bool | None:
    if key not in doc:
        return None
    return bool(doc.get(key))


def _fsf_mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _fsf_strings(value: object) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []
    return [str(item) for item in value if str(item)]


def _fsf_color_values(value: object) -> tuple[object, object]:
    colors = _fsf_mapping(value)
    return colors.get("white"), colors.get("black")


def _fsf_technical(key: str, value: object) -> str:
    if isinstance(value, (dict, list, tuple)):
        rendered = json.dumps(value, ensure_ascii=False, sort_keys=True)
    elif isinstance(value, bool):
        rendered = "true" if value else "false"
    else:
        rendered = str(value)
    return _technical(key, rendered)


def _fsf_add(
    lines: list[CataloguedRuleLine], text: str, key: str, value: object
) -> None:
    lines.append({"text": text, "technical": _fsf_technical(key, value)})


def _fsf_piece_names(info: Mapping[str, Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for raw_piece in info.get("pieces") or []:
        piece = _fsf_mapping(raw_piece)
        piece_type = str(piece.get("type") or "")
        fen = _fsf_mapping(piece.get("fen"))
        role = str(fen.get("white") or "").upper()
        if piece_type and role:
            names[piece_type] = f"{piece_type} ({role})"
    return names


def _fsf_piece_type_text(value: object, names: Mapping[str, str]) -> str:
    piece_types = _fsf_strings(value)
    return _join_values([names.get(piece_type, piece_type) for piece_type in piece_types]) or "none"


def _fsf_region_text(value: object) -> str:
    squares = _fsf_strings(value)
    if not squares:
        return "none"
    if len(squares) > 12:
        return f"{len(squares)} squares"
    return ", ".join(squares)


def _build_fsf_rule_summary(
    info: Mapping[str, Any], base_variant: str = ""
) -> CataloguedRuleSummary:
    template = str(info.get("template") or "")
    inherited_from = base_variant or (template if template and template != "fairy" else "")
    intro = [
        (
            "This is Fairy-Stockfish’s fully resolved rule set after inheriting "
            f"from `{inherited_from}`."
            if inherited_from
            else "This is Fairy-Stockfish’s fully resolved rule set."
        )
    ]
    sections: list[CataloguedRuleSection] = []
    names = _fsf_piece_names(info)

    board = _fsf_mapping(info.get("board"))
    board_lines: list[CataloguedRuleLine] = []
    _fsf_add(
        board_lines,
        f"The board is {board.get('width', '?')} files by {board.get('height', '?')} ranks.",
        "board",
        {"width": board.get("width"), "height": board.get("height")},
    )
    if bool(board.get("chess960")):
        _fsf_add(board_lines, "Chess960-style randomized starts are supported.", "board.chess960", True)
    if bool(board.get("twoBoards")):
        _fsf_add(board_lines, "The rules use two linked boards.", "board.twoBoards", True)
    diagonal_lines = _fsf_strings(board.get("diagonalLines"))
    if diagonal_lines:
        _fsf_add(
            board_lines,
            f"Special diagonal lines are active on {_fsf_region_text(diagonal_lines)}.",
            "board.diagonalLines",
            diagonal_lines,
        )
    sections.append({"title": "Board and setup", "kind": "boardSetup", "lines": board_lines})

    piece_lines: list[CataloguedRuleLine] = []
    piece_descriptions: list[str] = []
    for raw_piece in info.get("pieces") or []:
        piece = _fsf_mapping(raw_piece)
        piece_type = str(piece.get("type") or "piece")
        fen = _fsf_mapping(piece.get("fen"))
        role = str(fen.get("white") or "?").upper()
        custom_betza = piece.get("customBetza")
        description = f"{role}: {piece_type}"
        if custom_betza:
            description += f" (`{custom_betza}`)"
        piece_descriptions.append(description)
    if piece_descriptions:
        _fsf_add(piece_lines, "Available pieces: " + "; ".join(piece_descriptions) + ".", "pieces", info.get("pieces"))
    movement = _fsf_mapping(info.get("movement"))
    mobility = _fsf_mapping(movement.get("mobilityRegions"))
    restricted = [piece_type for piece_type, regions in mobility.items() if any(_fsf_strings(value) for value in _fsf_color_values(regions))]
    if restricted:
        _fsf_add(piece_lines, f"Movement is region-restricted for {_fsf_piece_type_text(restricted, names)}.", "movement.mobilityRegions", mobility)
    if piece_lines:
        sections.append({"title": "Pieces and movement", "lines": piece_lines})

    move_lines: list[CataloguedRuleLine] = []
    if bool(movement.get("mustCapture")):
        _fsf_add(move_lines, "Captures are mandatory when a legal capture is available.", "movement.mustCapture", True)
    pass_white, pass_black = _fsf_color_values(movement.get("pass"))
    if pass_white or pass_black:
        sides = [side for side, enabled in (("White", pass_white), ("Black", pass_black)) if enabled]
        _fsf_add(move_lines, f"{_join_values(sides)} may pass a turn.", "movement.pass", movement.get("pass"))
    stale_white, stale_black = _fsf_color_values(movement.get("passOnStalemate"))
    if stale_white or stale_black:
        sides = [side for side, enabled in (("White", stale_white), ("Black", stale_black)) if enabled]
        _fsf_add(move_lines, f"{_join_values(sides)} may pass when stalemated.", "movement.passOnStalemate", movement.get("passOnStalemate"))
    if bool(movement.get("doubleStep")):
        _fsf_add(move_lines, "Pawn double-step moves are enabled.", "movement.doubleStep", True)
    triple_white, triple_black = _fsf_color_values(movement.get("tripleStepRegions"))
    if _fsf_strings(triple_white) or _fsf_strings(triple_black):
        _fsf_add(move_lines, "Some pawns may make a triple-step move from configured regions.", "movement.tripleStepRegions", movement.get("tripleStepRegions"))
    ep_white, ep_black = _fsf_color_values(movement.get("enPassantTypes"))
    if _fsf_strings(ep_white) or _fsf_strings(ep_black):
        _fsf_add(move_lines, "En passant is enabled for configured piece types and regions.", "movement.enPassantTypes", movement.get("enPassantTypes"))
    soldier_promotion_rank = int(movement.get("soldierPromotionRank") or 0)
    if soldier_promotion_rank > 1:
        _fsf_add(
            move_lines,
            f"Soldiers use their pre-promotion movement until relative rank {soldier_promotion_rank}.",
            "movement.soldierPromotionRank",
            soldier_promotion_rank,
        )
    for key, text in (
        ("immobilityIllegal", "Moves that leave a piece without future legal movement are illegal."),
        ("cambodianMoves", "Cambodian/Ouk opening moves are enabled."),
        ("makpongRule", "The Makpong king-movement restriction is enabled."),
        ("flyingGeneral", "Facing generals or kings on an open file are illegal."),
    ):
        if bool(movement.get(key)):
            _fsf_add(move_lines, text, f"movement.{key}", True)
    castling = _fsf_mapping(info.get("castling"))
    if bool(castling.get("enabled")):
        _fsf_add(move_lines, "Castling is enabled with the resolved king, rook, file, and rank configuration.", "castling", castling)
    castling_wins = castling.get("wins")
    if isinstance(castling_wins, Mapping):
        winning_rights = []
        for color in ("white", "black"):
            side = _fsf_mapping(castling_wins.get(color))
            for flank, label in (("kingSide", "king-side"), ("queenSide", "queen-side")):
                if bool(side.get(flank)):
                    winning_rights.append(f"{color} {label}")
        if winning_rights:
            _fsf_add(
                move_lines,
                f"Winning castling rights: {_join_values(winning_rights)}.",
                "castling.wins",
                castling_wins,
            )
    elif int(castling_wins or 0):
        _fsf_add(
            move_lines,
            "Some castling rights are win conditions.",
            "castling.wins",
            castling_wins,
        )
    if move_lines:
        sections.append({"title": "Move rules", "lines": move_lines})

    drops = _fsf_mapping(info.get("drops"))
    drop_lines: list[CataloguedRuleLine] = []
    if bool(drops.get("enabled")):
        _fsf_add(drop_lines, "Pieces in hand can be dropped onto the board.", "drops.enabled", True)
    if bool(drops.get("capturesToHand")):
        _fsf_add(drop_lines, "Captured pieces return to the capturer’s hand.", "drops.capturesToHand", True)
    if bool(drops.get("mustDrop")):
        _fsf_add(drop_lines, f"Dropping {names.get(str(drops.get('mustDropType')), str(drops.get('mustDropType')))} is mandatory when possible.", "drops.mustDrop", True)
    for key, text in (
        ("firstRankPawnDrops", "Pawn drops on the first rank are allowed."),
        ("promotionZonePawnDrops", "Pawn drops in the promotion zone are allowed."),
        ("sittuyinRook", "Sittuyin rook-drop restrictions are enabled."),
        ("oppositeColoredBishop", "Dropped bishops must obey the opposite-colored-bishop restriction."),
        ("promoted", "Promoted pieces may be dropped in promoted form."),
        ("free", "Free/setup-style drops are enabled."),
    ):
        if bool(drops.get(key)):
            _fsf_add(drop_lines, text, f"drops.{key}", True)
    if str(drops.get("noDoubledType") or "none") != "none":
        _fsf_add(drop_lines, "Drops are limited to prevent too many same-type pieces on a file or board.", "drops.noDoubledType", drops.get("noDoubledType"))
    if drop_lines:
        sections.append({"title": "Drops and hands", "lines": drop_lines})

    promotion = _fsf_mapping(info.get("promotion"))
    promotion_lines: list[CataloguedRuleLine] = []
    promoted = _fsf_mapping(promotion.get("promotedPieceTypes"))
    if promoted:
        mappings = [f"{names.get(str(source), str(source))} → {names.get(str(target), str(target))}" for source, target in promoted.items()]
        _fsf_add(promotion_lines, "Promotion mappings: " + "; ".join(mappings) + ".", "promotion.promotedPieceTypes", promoted)
    white_targets, black_targets = _fsf_color_values(promotion.get("pieceTypes"))
    targets = list(dict.fromkeys(_fsf_strings(white_targets) + _fsf_strings(black_targets)))
    if targets:
        _fsf_add(promotion_lines, f"Regular promotion targets are {_fsf_piece_type_text(targets, names)}.", "promotion.pieceTypes", promotion.get("pieceTypes"))
    for key, text in (
        ("sittuyin", "Sittuyin-style promotion is enabled."),
        ("onCapture", "Eligible pieces promote when they capture."),
        ("mandatoryPawn", "Pawn promotion is mandatory where applicable."),
        ("mandatoryPiece", "Piece promotion is mandatory where applicable."),
        ("demotion", "Promoted pieces can demote according to the resolved rules."),
        ("shogiStyle", "Shogi-style source-to-target promotion is enabled."),
    ):
        if bool(promotion.get(key)):
            _fsf_add(promotion_lines, text, f"promotion.{key}", True)
    if promotion_lines:
        sections.append({"title": "Promotion", "lines": promotion_lines})

    capture = _fsf_mapping(info.get("capture"))
    capture_lines: list[CataloguedRuleLine] = []
    if bool(capture.get("blast")):
        _fsf_add(capture_lines, "Captures cause an atomic-style explosion.", "capture.blast", True)
    for key, text in (
        ("blastImmuneTypes", "Some piece types are immune to capture explosions."),
        ("mutuallyImmuneTypes", "Some piece types are mutually immune to capture."),
        ("petrifyTypes", "Some capturing pieces become walls after a capture."),
    ):
        if _fsf_strings(capture.get(key)):
            _fsf_add(capture_lines, text, f"capture.{key}", capture.get(key))
    if bool(capture.get("petrifyBlastPieces")):
        _fsf_add(capture_lines, "Pieces affected by the combined petrify/blast rule become walls.", "capture.petrifyBlastPieces", True)
    enclosing = _fsf_mapping(info.get("enclosing"))
    if str(enclosing.get("flipRule") or "none") != "none":
        _fsf_add(capture_lines, "Enclosed pieces change color according to the resolved enclosing rule.", "enclosing.flipRule", enclosing.get("flipRule"))
    if capture_lines:
        sections.append({"title": "Capture effects", "lines": capture_lines})

    gating = _fsf_mapping(info.get("gating"))
    wall_lines: list[CataloguedRuleLine] = []
    if bool(gating.get("seirawan")):
        _fsf_add(wall_lines, "Seirawan-style gating is enabled.", "gating.seirawan", True)
    if str(gating.get("wallingRule") or "none") != "none":
        _fsf_add(wall_lines, f"The `{gating.get('wallingRule')}` wall-placement rule is enabled.", "gating.wallingRule", gating.get("wallingRule"))
    if bool(gating.get("wallOrMove")):
        _fsf_add(wall_lines, "A turn may be either a wall placement or a piece move.", "gating.wallOrMove", True)
    if wall_lines:
        sections.append({"title": "Gating, walls, and blockers", "lines": wall_lines})

    end = _fsf_mapping(info.get("gameEnd"))
    ending_lines: list[CataloguedRuleLine] = []
    _fsf_add(ending_lines, "Check rules are enabled." if bool(end.get("checking")) else "The variant does not use ordinary check rules.", "gameEnd.checking", bool(end.get("checking")))
    if bool(end.get("checkCounting")):
        _fsf_add(ending_lines, "Checks are counted as a win condition.", "gameEnd.checkCounting", True)
    extinction = _fsf_mapping(info.get("extinction"))
    if str(extinction.get("value") or "none") != "none":
        _fsf_add(ending_lines, f"Extinction of {_fsf_piece_type_text(extinction.get('pieceTypes'), names)} is scored as {extinction.get('value')}.", "extinction", extinction)
    flag = _fsf_mapping(info.get("flag"))
    flag_white, flag_black = _fsf_color_values(flag.get("regions"))
    if _fsf_strings(flag_white) or _fsf_strings(flag_black):
        _fsf_add(ending_lines, "A flag/goal-region ending is active.", "flag", flag)
    connect = _fsf_mapping(info.get("connect"))
    if int(connect.get("n") or 0) > 0:
        directions = [name for name, enabled in (("horizontally", connect.get("horizontal")), ("vertically", connect.get("vertical")), ("diagonally", connect.get("diagonal"))) if enabled]
        _fsf_add(ending_lines, f"Connecting {connect.get('n')} pieces {_join_values(directions)} is a game-ending condition.", "connect.n", connect)
    if int(connect.get("nxn") or 0) > 0:
        _fsf_add(ending_lines, f"A {connect.get('nxn')}×{connect.get('nxn')} block is a game-ending condition.", "connect.nxn", connect.get("nxn"))
    if int(connect.get("collinearN") or 0) > 0:
        _fsf_add(ending_lines, f"Putting {connect.get('collinearN')} pieces on one line is a game-ending condition.", "connect.collinearN", connect.get("collinearN"))
    if str(end.get("stalemateValue") or "draw") != "draw":
        _fsf_add(ending_lines, f"Stalemate is scored as {end.get('stalemateValue')}.", "gameEnd.stalemateValue", end.get("stalemateValue"))
    if str(end.get("checkmateValue") or "loss") != "loss":
        _fsf_add(ending_lines, f"Checkmate is scored as {end.get('checkmateValue')}.", "gameEnd.checkmateValue", end.get("checkmateValue"))
    sections.append({"title": "Winning and losing", "lines": ending_lines})

    draw_lines: list[CataloguedRuleLine] = []
    n_move = int(end.get("nMoveRule") or 0)
    if n_move:
        _fsf_add(draw_lines, f"The n-move rule is set to {n_move} moves.", "gameEnd.nMoveRule", n_move)
    n_fold = int(end.get("nFoldRule") or 0)
    if n_fold:
        _fsf_add(draw_lines, f"{n_fold}-fold repetition is scored as {end.get('nFoldValue')}.", "gameEnd.nFoldRule", {"count": n_fold, "value": end.get("nFoldValue")})
    for key, text in (
        ("perpetualCheckIllegal", "Perpetual check is illegal."),
        ("moveRepetitionIllegal", "Repeating back-and-forth moves with the same piece is illegal."),
        ("bikjangRule", "The Janggi bikjang rule participates in adjudication."),
        ("adjudicateFullBoard", "The result is adjudicated when the board becomes full."),
    ):
        if bool(end.get(key)):
            _fsf_add(draw_lines, text, f"gameEnd.{key}", True)
    for key, label in (("chasingRule", "Chasing"), ("materialCounting", "Material counting"), ("countingRule", "Regional counting")):
        if str(end.get(key) or "none") != "none":
            _fsf_add(draw_lines, f"{label} uses the `{end.get(key)}` rule.", f"gameEnd.{key}", end.get(key))
    if draw_lines:
        sections.append({"title": "Draws and adjudication", "lines": draw_lines})

    return {"intro": intro, "sections": sections, "unknown": []}


@lru_cache(maxsize=RULE_SUMMARY_CACHE_SIZE)
def _cached_fsf_rule_summary(
    serialized_info: str, base_variant: str, generator_version: int
) -> CataloguedRuleSummary:
    del generator_version
    info = json.loads(serialized_info)
    return _build_fsf_rule_summary(info, base_variant)


def _build_catalogued_rule_summary(doc: Mapping[str, Any]) -> CataloguedRuleSummary:
    parsed = parse_catalogued_ini(str(doc.get("ini") or ""))
    intro: list[str] = []
    if parsed.parent:
        intro.append(
            f"This variant inherits its base rules from `{parsed.parent}` and overrides the settings shown below."
        )
    else:
        intro.append(
            "This variant is defined directly from a Fairy-Stockfish rule block. The text below is generated from the available configuration and may omit details that are only implicit in piece movement notation."
        )

    sections: list[CataloguedRuleSection] = []
    board_setup_lines = _board_setup_lines(parsed, doc)
    has_start_board = bool(doc.get("startFen")) or bool(doc.get("width")) or bool(doc.get("height"))
    if board_setup_lines or has_start_board:
        sections.append({"title": "Board and setup", "kind": "boardSetup", "lines": board_setup_lines})

    for title, lines in (
        ("Pieces and movement", _piece_lines(parsed, doc)),
        ("Move rules", _move_rule_lines(parsed)),
        ("Drops and hands", _drop_lines(parsed, doc)),
        ("Promotion", _promotion_lines(parsed, doc)),
        ("Capture effects", _capture_effect_lines(parsed)),
        ("Walls and blockers", _wall_lines(parsed)),
        ("Winning and losing", _ending_lines(parsed)),
        ("Draws and adjudication", _draw_lines(parsed)),
    ):
        if lines:
            sections.append({"title": title, "lines": lines})

    unknown = _unknown_lines(parsed)
    if unknown:
        intro.append(
            "Some options are still shown in technical form because they do not yet have friendly wording."
        )

    return {"intro": intro, "sections": sections, "unknown": unknown}


@lru_cache(maxsize=RULE_SUMMARY_CACHE_SIZE)
def _cached_catalogued_rule_summary(
    ini: str,
    start_fen: str,
    width: int,
    height: int,
    pieces: tuple[str, ...],
    pocket_roles: tuple[str, ...],
    promotion_roles: tuple[str, ...],
    capture_to_hand: bool | None,
    generator_version: int,
) -> CataloguedRuleSummary:
    del generator_version  # Cache-busting key for future wording/renderer changes.
    doc: dict[str, Any] = {
        "ini": ini,
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": list(pieces),
        "pocketRoles": list(pocket_roles),
        "promotionRoles": list(promotion_roles),
    }
    if capture_to_hand is not None:
        doc["captureToHand"] = capture_to_hand
    return _build_catalogued_rule_summary(doc)


def catalogued_rule_summary(doc: Mapping[str, Any]) -> CataloguedRuleSummary:
    fsf_variant_info = doc.get("fsfVariantInfo")
    if isinstance(fsf_variant_info, Mapping):
        return _cached_fsf_rule_summary(
            json.dumps(fsf_variant_info, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            str(doc.get("baseVariant") or ""),
            RULE_SUMMARY_GENERATOR_VERSION,
        )
    return _cached_catalogued_rule_summary(
        str(doc.get("ini") or ""),
        str(doc.get("startFen") or ""),
        _int_cache_value(doc.get("width")),
        _int_cache_value(doc.get("height")),
        _string_tuple(doc.get("pieces")),
        _string_tuple(doc.get("pocketRoles")),
        _string_tuple(doc.get("promotionRoles")),
        _optional_bool_cache_value(doc, "captureToHand"),
        RULE_SUMMARY_GENERATOR_VERSION,
    )

# fmt: on
