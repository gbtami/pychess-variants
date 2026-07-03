from __future__ import annotations

# fmt: off
from dataclasses import dataclass, field
import re
from typing import Any, Mapping, TypedDict


class CataloguedRuleLine(TypedDict):
    text: str
    technical: str


class CataloguedRuleSection(TypedDict):
    title: str
    lines: list[CataloguedRuleLine]


class CataloguedRuleSummary(TypedDict):
    intro: list[str]
    sections: list[CataloguedRuleSection]
    unknown: list[CataloguedRuleLine]


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
    width = int(doc.get("width") or 0)
    height = int(doc.get("height") or 0)
    start_fen = str(doc.get("startFen") or parsed.option("startFen") or "")

    if width and height:
        _add(lines, f"The board is {width} files by {height} ranks.", "board", f"{width}x{height}")
    elif parsed.has("maxFile") or parsed.has("maxRank"):
        _add(
            lines,
            f"The board size is configured as file {parsed.option('maxFile') or 'h'} by rank {parsed.option('maxRank') or '8'}.",
            "maxFile/maxRank",
            f"{parsed.option('maxFile') or '8'} / {parsed.option('maxRank') or '8'}",
        )

    if start_fen:
        _add(lines, "The starting position is defined by the variant FEN.", "startFen", start_fen)

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
        _add(lines, f"An extinction rule is active: reaching {count} remaining {_piece_code_text(piece_types)} causes {value}.", "extinctionValue", parsed.option("extinctionValue"))

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


def catalogued_rule_summary(doc: Mapping[str, Any]) -> CataloguedRuleSummary:
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
    for title, lines in (
        ("Board and setup", _board_setup_lines(parsed, doc)),
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

# fmt: on
