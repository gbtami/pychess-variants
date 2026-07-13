from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, NamedTuple, NotRequired, TypedDict, cast
from urllib.parse import unquote, urlparse

import aiohttp_session
from aiohttp import web
from pymongo.errors import DuplicateKeyError

from compress import MAX_COMPRESSED_BOARD_HEIGHT, MAX_COMPRESSED_BOARD_WIDTH
from const import ANON_PREFIX, STARTED
from fairy.fairy_board import sf
from fsf_variant_info import (
    FsfVariantInfoError,
    catalogued_variant_derived_fields,
    derive_catalogued_variant_info,
    mapping as fsf_mapping,
    parse_fsf_variant_info,
    piece_type_roles_by_color,
    validate_fsf_variant_info,
)
from json_utils import json_response
from pychess_global_app_state_utils import get_app_state
from catalogued_betza import catalogued_betza_diagrams
from catalogued_board import catalogued_start_board_preview
from catalogued_rules import catalogued_rule_summary
from request_utils import read_json_data, read_post_data, read_text_data
from settings import ADMINS
from variants import (
    CATALOGUED_VARIANTS,
    CataloguedServerVariant,
    ServerVariants,
    get_server_variant,
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
CATALOGUED_SOURCE_USER = "user"
CATALOGUED_SOURCE_FSF_BUILTIN = "fairy-stockfish-builtin"
CATALOGUED_FSF_BUILTIN_AUTHOR = "Fairy-Stockfish"
CATALOGUED_COMMUNITY_PAGE_SIZE = 20
MAX_CATALOGUED_VARIANTS_PER_USER = 20
MAX_CATALOGUED_FAVORITES_PER_USER = 500
CATALOGUED_AI_FAILURE_LIMIT = 3
CATALOGUED_AI_DISABLE_SECONDS = 24 * 60 * 60

MAX_CATALOGUED_PIECE_SET_TOTAL_BYTES = 256 * 1024
MAX_CATALOGUED_PIECE_SVG_BYTES = 32 * 1024
MAX_CATALOGUED_BOARD_SVG_BYTES = 128 * 1024
CATALOGUED_BOARD_ASPECT_RATIO_TOLERANCE = 0.02

MAX_CATALOGUED_INI_BYTES = 64 * 1024
MAX_DESCRIPTION_LEN = 1000
MAX_DISPLAY_NAME_LEN = 80

UNSUPPORTED_CATALOGUED_BOOL_RULES: dict[str, str] = {
    "twoBoards": "two-board variants need the dedicated bughouse/supply lobby and game flow.",
    "cambodianMoves": "Cambodian/Ouk opening moves need dedicated client-side move input support.",
    "materialCounting": "material counting needs variant-specific adjudication and UI support.",
    "freeDrops": "free drops need dedicated pocket/setup-flow tests.",
}

UNSUPPORTED_CATALOGUED_VALUE_RULES: dict[str, str] = {
    "countingRule": "regional counting needs dedicated adjudication and UI support.",
    "chasingRule": "chasing/perpetual adjudication needs history-aware regional-rule tests.",
}

VARIANT_NAME_ERROR = (
    "Variant names must be 3-32 chars, start with a lowercase letter, "
    "and contain only lowercase letters, digits, hyphens, and underscores."
)
CATALOGUED_PIECE_FAMILY_OVERRIDES = frozenset(
    {
        "asean",
        "ataxx",
        "borderlands",
        "cannonshogi",
        "capa",
        "chak",
        "chennis",
        "dobutsu",
        "dragon",
        "empire",
        "hoppel",
        "janggi",
        "khans",
        "kyoto",
        "letter",
        "makruk",
        "mansindam",
        "orda",
        "ordamirror",
        "seirawan",
        "shako",
        "shatranj",
        "shinobi",
        "shogi",
        "shogun",
        "sittuyin",
        "spartan",
        "standard",
        "synochess",
        "tori",
        "xiangfu",
        "xiangqi",
        "yokai",
        "perfect",
    }
)

FSF_CATALOGUED_BUILTIN_DESCRIPTION = (
    "Fairy-Stockfish built-in variant exposed as a casual community variant."
)


def _reference_label_for_url(url: str) -> str:
    host = urlparse(url).netloc.casefold().removeprefix("www.")
    if not host:
        return "Reference"
    if host.endswith("wikipedia.org"):
        return "Wikipedia"
    if host == "chessvariants.com":
        return "Chess Variant Pages"
    if host == "chessclub.com":
        return "ICC help"
    if host == "freechess.org":
        return "FICS help"
    if host == "arxiv.org":
        return "arXiv"
    if host == "github.com":
        return "GitHub"
    if host == "web.archive.org":
        return "Archived rules"
    if host == "binnewirtz.com":
        return "Binnewirtz"
    if host == "kotesovec.cz":
        return "Kotesovec"
    return host


def _fsf_builtin_references(*urls: str) -> tuple[dict[str, str], ...]:
    return tuple({"label": _reference_label_for_url(url), "url": url} for url in urls)


# Curated subset of Fairy-Stockfish built-ins that pychess exposes through the
# community/user-defined variant UI. Keep this list intentionally conservative
# and add entries only after the board, pieces, move input, analysis and
# saved-game paths have been tested on pychess. The catalogue entry name must
# remain the real Fairy-Stockfish UCI_Variant key so matching NNUE files can
# still be used.
#
# Avoid aliases/internal helpers, variants that need custom move encoding
# (duck/walling/flipping), setup/drop/gating flows, two-board flows, covered
# information, side-specific promotion UI, or regional adjudication that needs
# first-class client support. Admins can still fill in display metadata and
# upload piece/board SVGs for entries in this allowlist.
FSF_CATALOGUED_BUILTIN_VARIANTS: Mapping[str, Mapping[str, Any]] = {
    "5check": {
        "displayName": "Five-Check Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "3check",
    },
    "almost": {
        "displayName": "Almost Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Almost_chess"),
        "baseVariant": "chess",
    },
    "amazon": {
        "displayName": "Amazon Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/diffmove.dir/amazone.html",
        ),
        "baseVariant": "chess",
    },
    "atomar": {
        "displayName": "Atomar",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://web.archive.org/web/20230519082613/"
            "https://chronatog.com/wp-content/uploads/2021/09/"
            "atomar-chess-rules.pdf",
        ),
        "baseVariant": "atomic",
    },
    "berolina": {
        "displayName": "Berolina Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/dpieces.dir/berlin.html",
        ),
        "baseVariant": "chess",
    },
    "centaur": {
        "displayName": "Centaur Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/large.dir/contest/royalcourt.html",
        ),
        "baseVariant": "capablanca",
    },
    "chancellor": {
        "displayName": "Chancellor Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Chancellor_chess"),
        "baseVariant": "capablanca",
    },
    "chaturanga": {
        "displayName": "Chaturanga",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Chaturanga"),
        "baseVariant": "shatranj",
    },
    "codrus": {
        "displayName": "Codrus",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("http://www.binnewirtz.com/Schlagschach1.htm"),
        "baseVariant": "antichess",
    },
    "coregal": {
        "displayName": "Coregal Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/winning.dir/coregal.html",
        ),
        "baseVariant": "chess",
    },
    "courier": {
        "displayName": "Courier Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Courier_chess"),
        "baseVariant": "shatranj",
    },
    "extinction": {
        "displayName": "Extinction Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Extinction_chess"),
        "baseVariant": "chess",
    },
    "gardner": {
        "displayName": "Gardner Minichess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Minichess#5%C3%975_chess",
        ),
        "baseVariant": "chess",
    },
    "georgian": {
        "displayName": "Georgian Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "chess",
    },
    "giveaway": {
        "displayName": "Giveaway Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/diffobjective.dir/giveaway.old.html",
        ),
        "baseVariant": "antichess",
    },
    "grasshopper": {
        "displayName": "Grasshopper Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Grasshopper_chess"),
        "baseVariant": "chess",
    },
    "janus": {
        "displayName": "Janus Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Janus_Chess"),
        "baseVariant": "capablanca",
    },
    "kinglet": {
        "displayName": "Kinglet",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/V._R._Parton#Kinglet_chess",
        ),
        "baseVariant": "chess",
    },
    "knightmate": {
        "displayName": "Knightmate",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/diffobjective.dir/knightmate.html",
        ),
        "baseVariant": "chess",
    },
    "legan": {
        "displayName": "Legan Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Legan_chess"),
        "baseVariant": "chess",
    },
    "losalamos": {
        "displayName": "Los Alamos Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Los_Alamos_chess"),
        "baseVariant": "chess",
    },
    "losers": {
        "displayName": "Losers Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://www.chessclub.com/help/Wild17"),
        "baseVariant": "antichess",
    },
    "misere": {
        "displayName": "Misère Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("http://www.kotesovec.cz/gustav/gustav_alybadix.htm"),
        "baseVariant": "chess",
    },
    "modern": {
        "displayName": "Modern Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Modern_chess"),
        "baseVariant": "capablanca",
    },
    "newzealand": {
        "displayName": "New Zealand Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "chess",
    },
    "nightrider": {
        "displayName": "Nightrider Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Nightrider_(chess)"),
        "baseVariant": "chess",
    },
    "nocastle": {
        "displayName": "No-Castle Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "chess",
    },
    "nocheckatomic": {
        "displayName": "No-Check Atomic",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://www.chessclub.com/help/atomic"),
        "baseVariant": "atomic",
    },
    "opulent": {
        "displayName": "Opulent Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://www.chessvariants.com/rules/opulent-chess"),
        "baseVariant": "grand",
    },
    "pawnback": {
        "displayName": "Pawnback Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://arxiv.org/abs/2009.04374"),
        "baseVariant": "chess",
    },
    "pawnsideways": {
        "displayName": "Pawnsideways Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://arxiv.org/abs/2009.04374"),
        "baseVariant": "chess",
    },
    "perfect": {
        "displayName": "Perfect Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/diffmove.dir/perfectchess.html",
        ),
        "baseVariant": "chess",
    },
    "shatar": {
        "displayName": "Shatar",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Shatar"),
        "baseVariant": "shatranj",
    },
    "suicide": {
        "displayName": "Suicide Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.freechess.org/Help/HelpFiles/suicide_chess.html",
        ),
        "baseVariant": "antichess",
    },
    "tencubed": {
        "displayName": "Ten Cubed Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/contests/10/tencubedchess.html",
        ),
        "baseVariant": "grand",
    },
    "threekings": {
        "displayName": "Three Kings",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://github.com/cutechess/cutechess/blob/master/"
            "projects/lib/src/board/threekingsboard.h",
        ),
        "baseVariant": "chess",
    },
    "torpedo": {
        "displayName": "Torpedo Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://arxiv.org/abs/2009.04374"),
        "baseVariant": "chess",
    },
}

# Structured backlog of Fairy-Stockfish built-ins that are not currently
# first-class pychess variants and are not seeded through
# FSF_CATALOGUED_BUILTIN_VARIANTS above. This constant is deliberately unused by
# the runtime seeding path: entries here are candidates for future review only.
#
# To enable one, move/copy its metadata to FSF_CATALOGUED_BUILTIN_VARIANTS and
# test the complete pychess flow first: game creation, move input, replay,
# analysis, fishnet/AI, piece-set compatibility, rules text, board preview,
# clocks/byo where relevant, and saved-game export/import. Some entries are
# aliases, internal helpers, drop/setup variants, pass/wall/flipping games, or
# regionally adjudicated rule sets, so presence here does not imply that the
# variant is safe or useful to expose.
FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES: Mapping[str, Mapping[str, Any]] = {
    "ai-wok": {
        "displayName": "Ai-Wok",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "makruk",
        "reviewNotes": "Makruk-family fairy-piece variant; review pieces and promotion UI.",
    },
    "amazons": {
        "displayName": "Game of the Amazons",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Game_of_the_Amazons",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Non-chess placement/blocking game; needs move-input and rules review.",
    },
    "armageddon": {
        "displayName": "Armageddon Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Fast_chess#Armageddon",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Likely needs time-odds/draw-odds UI before exposing.",
    },
    "breakthrough": {
        "displayName": "Breakthrough",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Breakthrough_(board_game)",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Non-checkmate objective; verify result handling and notation.",
    },
    "caparandom": {
        "displayName": "Capablanca Random Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Capablanca_random_chess",
        ),
        "baseVariant": "capablanca",
        "reviewNotes": "Shuffle variant; pychess already has Capablanca960-style support.",
    },
    "checkshogi": {
        "displayName": "Check-Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "shogi",
        "reviewNotes": "Shogi-family check-counting variant; review byo/check-counter UI.",
    },
    "chessgi": {
        "displayName": "Chessgi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Crazyhouse#Variations",
        ),
        "baseVariant": "crazyhouse",
        "reviewNotes": "Drop variant with changed pawn-drop rules; review pocket/drop UI.",
    },
    "chigorin": {
        "displayName": "Chigorin Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/diffsetup.dir/chigorin.html",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Asymmetric piece movement; review piece identities and diagrams.",
    },
    "clobber": {
        "displayName": "Clobber",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Clobber"),
        "baseVariant": "chess",
        "reviewNotes": "Non-chess game; verify pass/stalemate/objective handling.",
    },
    "clobber10": {
        "displayName": "Clobber 10x10",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Clobber"),
        "baseVariant": "clobber",
        "reviewNotes": "Large-board non-chess game; verify board sizing and objective handling.",
    },
    "euroshogi": {
        "displayName": "EuroShogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/EuroShogi"),
        "baseVariant": "shogi",
        "reviewNotes": "Shogi-family drops/promotions; review piece assets and byo UI.",
    },
    "fairy": {
        "displayName": "Fairy",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "chess",
        "reviewNotes": "Internal helper used by Fairy-Stockfish endgame initialization; do not expose.",
    },
    "fischerandom": {
        "displayName": "Fischer Random Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Fischer_random_chess",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Alias of Chess960; pychess already exposes this as Chess960.",
    },
    "flipello": {
        "displayName": "Flipello",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Reversi#Othello",
        ),
        "baseVariant": "flipersi",
        "reviewNotes": "Reversi-like placement game; verify pass/drop-like move flow.",
    },
    "flipello10": {
        "displayName": "Flipello 10x10",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Reversi"),
        "baseVariant": "flipello",
        "reviewNotes": "Large-board Reversi-like placement game; verify pass/drop-like move flow.",
    },
    "flipersi": {
        "displayName": "Flipersi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Reversi"),
        "baseVariant": "chess",
        "reviewNotes": "Reversi-like placement game; verify pass/drop-like move flow.",
    },
    "fox-and-hounds": {
        "displayName": "Fox and Hounds",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://boardgamegeek.com/boardgame/148180/fox-and-hounds",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Asymmetric non-capturing game; verify result handling and pieces.",
    },
    "gorogoro": {
        "displayName": "Gorogoro Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/D%C5%8Dbutsu_sh%C5%8Dgi#Variation",
        ),
        "baseVariant": "shogi",
        "reviewNotes": "Pychess exposes Gorogoro+ separately; compare rule differences first.",
    },
    "gustav3": {
        "displayName": "Gustav III Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/play/gustav-iiis-chess",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Uses wall squares; needs dedicated board/move-input review.",
    },
    "isolation": {
        "displayName": "Isolation",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://boardgamegeek.com/boardgame/1875/isolation",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Non-chess blocking game; verify move encoding and result handling.",
    },
    "isolation7x7": {
        "displayName": "Isolation 7x7",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://boardgamegeek.com/boardgame/1875/isolation",
        ),
        "baseVariant": "isolation",
        "reviewNotes": "Non-chess blocking game; verify move encoding and result handling.",
    },
    "janggicasual": {
        "displayName": "Janggi Casual",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "janggi",
        "reviewNotes": "Janggi rule-set alias/variant; compare with existing pychess Janggi support.",
    },
    "janggimodern": {
        "displayName": "Janggi Modern",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "janggi",
        "reviewNotes": "Janggi rule-set alias/variant; compare with existing pychess Janggi support.",
    },
    "janggitraditional": {
        "displayName": "Janggi Traditional",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "janggi",
        "reviewNotes": "Janggi rule-set alias/variant; compare with existing pychess Janggi support.",
    },
    "jesonmor": {
        "displayName": "Jeson Mor",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Jeson_Mor"),
        "baseVariant": "chess",
        "reviewNotes": "Asymmetric goal variant; review result handling and piece identities.",
    },
    "joust": {
        "displayName": "Joust",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/programs.dir/joust.html",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Non-capturing knight game; verify objective and move display.",
    },
    "judkins": {
        "displayName": "Judkins Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Judkins_shogi"),
        "baseVariant": "shogi",
        "reviewNotes": "Shogi-family drops/promotions; review piece assets and byo UI.",
    },
    "karouk": {
        "displayName": "Kar Ouk",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Makruk#Ka_Ouk",
        ),
        "baseVariant": "cambodian",
        "reviewNotes": "Cambodian/Makruk-family first-check-wins variant; review adjudication/UI.",
    },
    "koedem": {
        "displayName": "Koedem",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "http://schachclub-oetigheim.de/wp-content/uploads/2016/04/Koedem-rules.pdf",
        ),
        "baseVariant": "bughouse",
        "reviewNotes": "Bughouse-family/two-board variant; not suitable for catalogued flow yet.",
    },
    "loop": {
        "displayName": "Loop Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Crazyhouse#Variations",
        ),
        "baseVariant": "crazyhouse",
        "reviewNotes": "Drop variant; review pocket/drop UI and promoted-piece capture behavior.",
    },
    "micro": {
        "displayName": "Micro Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Micro_shogi"),
        "baseVariant": "shogi",
        "reviewNotes": "Kyoto-style flipping/demotion mechanics; review move encoding/UI.",
    },
    "mini": {
        "displayName": "Mini Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "minishogi",
        "reviewNotes": "Alias of Minishogi; pychess already exposes Minishogi.",
    },
    "normal": {
        "displayName": "Normal Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Chess"),
        "baseVariant": "chess",
        "reviewNotes": "Alias of standard chess; pychess already exposes Chess.",
    },
    "okisakishogi": {
        "displayName": "Okisaki Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Okisaki_shogi"),
        "baseVariant": "shogi",
        "reviewNotes": "Shogi-family drops/promotions; review piece assets and byo UI.",
    },
    "omicron": {
        "displayName": "Omicron Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "http://www.eglebbk.dds.nl/program/chess-omicron.html",
        ),
        "baseVariant": "chess",
        "reviewNotes": "12x10 Omega-family variant; review board sizing, pieces and promotion UI.",
    },
    "paradigm": {
        "displayName": "Paradigm Chess30",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/rules/paradigm-chess30",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Uses non-standard bishop/horse hybrid pieces; review identities/assets.",
    },
    "petrified": {
        "displayName": "Petrified",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://www.chess.com/variants/petrified"),
        "baseVariant": "pawnsideways",
        "reviewNotes": "Petrification mechanic may need dedicated UI/replay testing.",
    },
    "pocketknight": {
        "displayName": "Pocket Knight Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/other.dir/pocket.html",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Pocket/drop variant; review pocket UI and drop legality display.",
    },
    "raazuvaa": {
        "displayName": "Raazuvaa",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "baseVariant": "chess",
        "reviewNotes": "Maldivian chess-like rules; needs rules/reference and adjudication review.",
    },
    "snailtrail": {
        "displayName": "Snail Trail",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://boardgamegeek.com/boardgame/37135/snailtrail",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Non-chess blocking game; verify move encoding and result handling.",
    },
    "sortofalmost": {
        "displayName": "Sort-of-Almost Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://en.wikipedia.org/wiki/Almost_chess#Sort_of_almost_chess",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Asymmetric Almost Chess variant; verify pieces and castling assumptions.",
    },
    "troitzky": {
        "displayName": "Troitzky Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references(
            "https://www.chessvariants.com/play/troitzky-chess",
        ),
        "baseVariant": "chess",
        "reviewNotes": "Large/fairy-piece variant; review piece identities and promotion UI.",
    },
    "wolf": {
        "displayName": "Wolf Chess",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Wolf_chess"),
        "baseVariant": "chess",
        "reviewNotes": "10x8 fairy-piece variant; review piece identities and promotion UI.",
    },
    "yarishogi": {
        "displayName": "Yari Shogi",
        "description": FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        "references": _fsf_builtin_references("https://en.wikipedia.org/wiki/Yari_shogi"),
        "baseVariant": "shogi",
        "reviewNotes": "Shogi-family drops/promotions; review piece assets and byo UI.",
    },
}


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FSF_CHECK_TIMEOUT_SECONDS = 8.0
BUILTIN_VARIANT_NAMES = frozenset(variant.server_name for variant in ServerVariants)
BUILTIN_FSF_VARIANT_NAMES = frozenset(sf.variants())


class VariantSectionMatch(NamedTuple):
    start: int
    end: int
    name: str
    suffix: str


class CataloguedVariantValidation(NamedTuple):
    name: str
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
    base_variant: str
    fsf_variant_info: dict[str, Any]


class CataloguedVariantPieceSetSvg(TypedDict):
    svg: str
    size: int


class CataloguedVariantBoardSvg(TypedDict):
    svg: str
    size: int


class CataloguedVariantReference(TypedDict):
    label: str
    url: str


class CataloguedVariantDocument(TypedDict):
    _id: str
    name: str
    displayName: str
    description: str
    author: str
    ini: str
    baseVariant: str
    enabled: bool
    archived: bool
    startFen: str
    width: int
    height: int
    pieces: list[str]
    kingRoles: list[str]
    pocketRoles: list[str]
    captureToHand: bool
    promotionType: str
    promotionRoles: list[str]
    promotionOrder: list[str]
    showPromoted: bool
    rulesGate: bool
    rulesPass: bool
    legalMovesNeedHistory: bool
    nFoldIsDraw: bool
    showCheckCounters: bool
    fsfVariantInfo: NotRequired[dict[str, Any]]
    icon: str
    category: str
    visibility: str
    source: NotRequired[str]
    fsfBuiltinVariant: NotRequired[str]
    pieceFamilyOverride: NotRequired[str]
    references: NotRequired[list[CataloguedVariantReference]]
    pieceSet: NotRequired[dict[str, CataloguedVariantPieceSetSvg]]
    pieceSetUpdatedAt: NotRequired[datetime]
    boardSvg: NotRequired[CataloguedVariantBoardSvg]
    boardSvgUpdatedAt: NotRequired[datetime]
    aiFailureCount: NotRequired[int]
    aiLastFailureAt: NotRequired[datetime]
    aiLastFailureReason: NotRequired[str]
    aiDisabledAt: NotRequired[datetime]
    aiDisabledUntil: NotRequired[datetime]
    aiDisabledReason: NotRequired[str]
    gameCount: int
    createdAt: datetime
    updatedAt: datetime


class CataloguedVariantClientDocument(TypedDict):
    name: str
    displayName: str
    tooltip: str
    ini: str
    baseVariant: str
    startFen: str
    width: int
    height: int
    pieces: list[str]
    kingRoles: list[str]
    pocketRoles: list[str]
    captureToHand: bool
    promotionType: str
    promotionRoles: list[str]
    promotionOrder: list[str]
    showPromoted: bool
    rulesGate: bool
    rulesPass: bool
    showCheckCounters: bool
    fsfVariantInfo: NotRequired[dict[str, Any]]
    icon: str
    category: str
    author: NotRequired[str]
    source: NotRequired[str]
    system: NotRequired[bool]
    fsfBuiltinVariant: NotRequired[str]
    pieceFamilyOverride: NotRequired[str]
    references: NotRequired[list[CataloguedVariantReference]]
    archived: NotRequired[bool]
    enabled: NotRequired[bool]
    gameCount: NotRequired[int]
    locked: NotRequired[bool]
    visibility: NotRequired[str]
    aiDisabled: NotRequired[bool]
    aiDisabledReason: NotRequired[str]
    aiDisabledUntil: NotRequired[datetime]
    favorite: NotRequired[bool]
    hasPieceSet: NotRequired[bool]
    pieceSetRevision: NotRequired[str]
    hasBoard: NotRequired[bool]
    boardRevision: NotRequired[str]


def _is_admin_username(username: str) -> bool:
    lowered = username.casefold()
    return any(lowered == admin.casefold() for admin in ADMINS)


def _is_active_catalogued_doc(doc: Mapping[str, Any]) -> bool:
    return bool(doc.get("enabled", True)) and not bool(doc.get("archived", False))


def _catalogued_visibility(doc: Mapping[str, Any]) -> str:
    visibility = str(doc.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE).strip().lower()
    return visibility if visibility in CATALOGUED_VISIBILITIES else CATALOGUED_VISIBILITY_PRIVATE


def _catalogued_source(doc: Mapping[str, Any]) -> str:
    source = str(doc.get("source") or CATALOGUED_SOURCE_USER).strip().lower()
    if source == CATALOGUED_SOURCE_FSF_BUILTIN:
        return CATALOGUED_SOURCE_FSF_BUILTIN
    return CATALOGUED_SOURCE_USER


def _clean_piece_family_override(piece_family: str | None) -> str:
    cleaned = str(piece_family or "").strip().lower()
    if cleaned in {"", "auto", "auto-detect", "autodetect"}:
        return ""
    if cleaned not in CATALOGUED_PIECE_FAMILY_OVERRIDES:
        raise web.HTTPBadRequest(text="Unknown catalogued piece-set override.")
    return cleaned


def _read_piece_family_override(data: Mapping[str, Any]) -> str:
    # Treat an explicit empty modern field as a request to clear the override.
    # Do not let a stale legacy snake_case value revive an old override when the
    # admin selects "Auto-detect" in the current UI.
    if "pieceFamilyOverride" in data:
        value = data.get("pieceFamilyOverride")
    else:
        value = data.get("piece_family_override")
    return _clean_piece_family_override(str(value or ""))


def _catalogued_piece_family_override(doc: Mapping[str, Any]) -> str:
    try:
        return _clean_piece_family_override(str(doc.get("pieceFamilyOverride") or ""))
    except web.HTTPBadRequest:
        return ""


def _is_fsf_builtin_catalogued_doc(doc: Mapping[str, Any]) -> bool:
    return _catalogued_source(doc) == CATALOGUED_SOURCE_FSF_BUILTIN


def _fsf_builtin_variant_name(doc: Mapping[str, Any]) -> str:
    return str(doc.get("fsfBuiltinVariant") or doc.get("name") or doc.get("_id") or "")


def _utc_datetime(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def catalogued_variant_ai_disabled_until(
    doc: Mapping[str, Any], *, now: datetime | None = None
) -> datetime | None:
    """Return an active fishnet AI-disable deadline for this catalogued variant."""

    disabled_until = _utc_datetime(doc.get("aiDisabledUntil"))
    if disabled_until is None:
        return None
    now = now or datetime.now(timezone.utc)
    return disabled_until if disabled_until > now else None


def catalogued_variant_ai_disabled(doc: Mapping[str, Any], *, now: datetime | None = None) -> bool:
    return catalogued_variant_ai_disabled_until(doc, now=now) is not None


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


def _clean_favorite_names(value: object) -> set[str]:
    if not isinstance(value, (list, tuple, set)):
        return set()
    return {str(name) for name in value if isinstance(name, str) and _is_valid_variant_name(name)}


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


def extract_variant_base_name(ini: str) -> str:
    matches = _catalogued_variant_section_matches(ini)
    if len(matches) != 1:
        raise web.HTTPBadRequest(text="The INI must contain exactly one variant section.")

    suffix = matches[0].suffix.strip()
    return suffix[1:].strip() if suffix.startswith(":") else ""


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


def _ini_option_is_enabled(ini: str, key: str) -> bool:
    value = _ini_option(ini, key)
    if value is None:
        return False
    return value.strip().casefold() in {"true", "yes", "1", "on"}


def _ini_option_has_non_neutral_value(ini: str, key: str) -> bool:
    value = _ini_option(ini, key)
    if value is None:
        return False
    return value.strip().casefold() not in {"", "-", "0", "false", "no", "off", "none"}


def _ensure_catalogued_rules_supported(ini: str) -> None:
    unsupported: list[str] = []

    for key, reason in UNSUPPORTED_CATALOGUED_BOOL_RULES.items():
        if _ini_option_is_enabled(ini, key):
            unsupported.append(f"{key}: {reason}")

    if _ini_option_is_enabled(ini, "gating") and not _ini_option_is_enabled(ini, "seirawanGating"):
        unsupported.append(
            "gating: only Seirawan-style gating is supported for user-defined variants so far."
        )

    if _ini_option_has_non_neutral_value(ini, "wallingRule"):
        unsupported.append(
            "wallingRule: walling/duck-style moves need dedicated client input and move encoding support."
        )

    for key, reason in UNSUPPORTED_CATALOGUED_VALUE_RULES.items():
        if _ini_option_has_non_neutral_value(ini, key):
            unsupported.append(f"{key}: {reason}")

    if unsupported:
        raise web.HTTPBadRequest(
            text=(
                "This Fairy-Stockfish rule is not supported for user-defined variants yet: "
                + "; ".join(unsupported)
            )
        )


def _resolved_variant_info(name: str) -> dict[str, Any]:
    variant_info = getattr(sf, "variant_info", None)
    if variant_info is None:
        raise web.HTTPServiceUnavailable(
            text=(
                "This pychess server requires a Fairy-Stockfish Python binding "
                "with variant_info() support."
            )
        )
    try:
        return parse_fsf_variant_info(variant_info(name), expected_name=name)
    except FsfVariantInfoError as exc:
        log.warning("Invalid Fairy-Stockfish variant information for %s", name, exc_info=True)
        raise web.HTTPBadRequest(text=str(exc)) from exc


def _stored_variant_info(doc: Mapping[str, Any]) -> dict[str, Any]:
    name = str(doc.get("name") or doc.get("_id") or "")
    try:
        return validate_fsf_variant_info(doc.get("fsfVariantInfo"), expected_name=name or None)
    except FsfVariantInfoError:
        return {}


def _ensure_resolved_catalogued_rules_supported(info: Mapping[str, Any]) -> None:
    """Reject unsupported behavior after inheritance and defaults are resolved by FSF."""

    board = fsf_mapping(info.get("board"))
    movement = fsf_mapping(info.get("movement"))
    drops = fsf_mapping(info.get("drops"))
    gating = fsf_mapping(info.get("gating"))
    game_end = fsf_mapping(info.get("gameEnd"))

    unsupported: list[str] = []
    if bool(board.get("twoBoards")):
        unsupported.append(
            "twoBoards: two-board variants need the dedicated bughouse/supply lobby and game flow."
        )
    if bool(movement.get("cambodianMoves")):
        unsupported.append(
            "cambodianMoves: Cambodian/Ouk opening moves need dedicated client-side move input support."
        )
    if str(game_end.get("materialCounting") or "none") != "none":
        unsupported.append(
            "materialCounting: material counting needs variant-specific adjudication and UI support."
        )
    if bool(drops.get("free")):
        unsupported.append("freeDrops: free drops need dedicated pocket/setup-flow tests.")
    if str(game_end.get("countingRule") or "none") != "none":
        unsupported.append(
            "countingRule: regional counting needs dedicated adjudication and UI support."
        )
    if str(game_end.get("chasingRule") or "none") != "none":
        unsupported.append(
            "chasingRule: chasing/perpetual adjudication needs history-aware regional-rule tests."
        )
    if bool(gating.get("enabled")) and not bool(gating.get("seirawan")):
        unsupported.append(
            "gating: only Seirawan-style gating is supported for user-defined variants so far."
        )
    if str(gating.get("wallingRule") or "none") != "none":
        unsupported.append(
            "wallingRule: walling/duck-style moves need dedicated client input and move encoding support."
        )

    if unsupported:
        raise web.HTTPBadRequest(
            text=(
                "This resolved Fairy-Stockfish rule is not supported for user-defined variants yet: "
                + "; ".join(unsupported)
            )
        )


PIECE_SET_FILENAME_RE = re.compile(r"^([wb])(\+?)([A-Za-z])\.svg$")
XML_DECL_RE = re.compile(r"^\ufeff?\s*<\?xml\s+[^?]*\?>", re.IGNORECASE)
SVG_DOCTYPE_RE = re.compile(
    r"^\s*<!DOCTYPE\s+svg\s+"
    r'(?:PUBLIC\s+"[^"]*"\s+"[^"]*"|SYSTEM\s+"[^"]*")\s*>',
    re.IGNORECASE,
)
XML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
SAFE_SVG_TAGS = frozenset(
    {
        "svg",
        "defs",
        "g",
        "pattern",
        "linearGradient",
        "radialGradient",
        "stop",
        "filter",
        "feGaussianBlur",
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
        "id",
        "viewBox",
        "width",
        "height",
        "patternUnits",
        "patternContentUnits",
        "patternTransform",
        "gradientUnits",
        "gradientTransform",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "fx",
        "fy",
        "r",
        "rx",
        "ry",
        "offset",
        "d",
        "points",
        "fill",
        "stroke",
        "stop-color",
        "stop-opacity",
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
        "filter",
        "stdDeviation",
        "transform",
        "transform-origin",
        "href",
        "aria-label",
        "role",
    }
)
SAFE_SVG_STYLE_ATTRS = frozenset(
    {
        "fill",
        "stroke",
        "stop-color",
        "stop-opacity",
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
        "filter",
        "transform",
        "transform-origin",
    }
)
SAFE_SVG_VALUE_RE = re.compile(r"^[#%,.0-9A-Za-z_() +\-/:]*$")
SAFE_SVG_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.:-]*$")
SAFE_SVG_LOCAL_REF_RE = re.compile(r"^url\(#[A-Za-z_][A-Za-z0-9_.:-]*\)$")
SAFE_SVG_FRAGMENT_REF_RE = re.compile(r"^#[A-Za-z_][A-Za-z0-9_.:-]*$")


def _local_xml_name(name: str) -> str:
    if "}" in name:
        return name.rsplit("}", 1)[1]
    return name


def _svg_value_is_unsafe(value: str, *, allow_local_ref: bool = False) -> bool:
    lowered = value.casefold()
    if "javascript:" in lowered or "data:" in lowered:
        return True
    if "url(" not in lowered:
        return False
    return not (allow_local_ref and SAFE_SVG_LOCAL_REF_RE.fullmatch(value) is not None)


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
        if prop not in SAFE_SVG_STYLE_ATTRS:
            continue
        cleaned_value = value.strip()
        allow_local_ref_value = prop in {"fill", "stroke", "filter"}
        if _svg_value_is_unsafe(cleaned_value, allow_local_ref=allow_local_ref_value):
            raise web.HTTPBadRequest(text=f"{filename} contains unsafe SVG attribute values.")
        if not SAFE_SVG_VALUE_RE.fullmatch(cleaned_value):
            raise web.HTTPBadRequest(text=f"{filename} contains unsupported SVG attribute values.")
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


def _fen_piece_roles_by_color(start_fen: str) -> dict[str, tuple[set[str], set[str]]]:
    roles = {"white": (set(), set()), "black": (set(), set())}
    board_and_pocket = start_fen.split(" ", 1)[0]
    promoted = False
    for character in board_and_pocket:
        if character == "+":
            promoted = True
            continue
        if not character.isascii() or not character.isalpha():
            promoted = False
            continue
        color = "white" if character.isupper() else "black"
        base_roles, promoted_roles = roles[color]
        role = character.lower()
        (promoted_roles if promoted else base_roles).add(role)
        promoted = False
    return roles


def _catalogued_piece_set_required_filenames(doc: Mapping[str, Any]) -> list[str]:
    fsf_variant_info = _stored_variant_info(doc)
    if fsf_variant_info:
        type_roles = piece_type_roles_by_color(fsf_variant_info)
        start_fen = str(fsf_mapping(fsf_variant_info.get("board")).get("startFen") or "")
        fen_roles = _fen_piece_roles_by_color(start_fen)
        promoted_piece_types = fsf_mapping(
            fsf_mapping(fsf_variant_info.get("promotion")).get("promotedPieceTypes")
        )
        roles_by_color: dict[str, set[str]] = {"white": set(), "black": set()}
        promoted_by_color: dict[str, set[str]] = {"white": set(), "black": set()}
        for color in ("white", "black"):
            roles_by_color[color].update(type_roles[color].values())
            roles_by_color[color].update(fen_roles[color][0])
            promoted_by_color[color].update(fen_roles[color][1])
            for source_type in promoted_piece_types:
                role = type_roles[color].get(str(source_type))
                if role:
                    promoted_by_color[color].add(role)

        filenames: list[str] = []
        for color, prefix in (("white", "w"), ("black", "b")):
            filenames.extend(
                f"{prefix}{role.upper()}.svg" for role in sorted(roles_by_color[color])
            )
            filenames.extend(
                f"{prefix}+{role.upper()}.svg" for role in sorted(promoted_by_color[color])
            )
        return filenames

    roles = {str(role).lower() for role in doc.get("pieces", []) if str(role).isalpha()}
    promotion_type = str(doc.get("promotionType") or "regular").casefold()
    promoted_roles = (
        {str(role).lower() for role in doc.get("promotionRoles", []) if str(role).isalpha()}
        if promotion_type == "shogi"
        else set()
    )
    filenames = []
    for color in ("w", "b"):
        filenames.extend(f"{color}{role.upper()}.svg" for role in sorted(roles))
        filenames.extend(f"{color}+{role.upper()}.svg" for role in sorted(promoted_roles))
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


def _board_svg_revision(doc: Mapping[str, Any]) -> str:
    updated_at = doc.get("boardSvgUpdatedAt")
    if isinstance(updated_at, datetime):
        return str(int(updated_at.timestamp()))
    return re.sub(r"\W+", "", str(updated_at or "0")) or "0"


def _sanitize_catalogued_svg(
    raw: bytes,
    filename: str,
    max_bytes: int,
) -> str:
    if not raw:
        raise web.HTTPBadRequest(text=f"{filename} is empty.")
    if len(raw) > max_bytes:
        raise web.HTTPBadRequest(
            text=(f"{filename} is too large. The SVG must be at most {max_bytes // 1024} KiB.")
        )

    text = raw.decode("utf-8", errors="strict").strip()
    xml_decl = XML_DECL_RE.match(text)
    if xml_decl is not None:
        text = text[xml_decl.end() :].lstrip()

    # Many editor-exported SVG files include the legacy SVG 1.1 external DTD.
    # It does not carry image data, and keeping it only makes otherwise safe
    # piece sets fail. Strip only the simple external SVG doctype form; any
    # internal subset / entity declaration is still rejected by the check below.
    svg_doctype = SVG_DOCTYPE_RE.match(text)
    if svg_doctype is not None:
        text = text[svg_doctype.end() :].lstrip()

    text = XML_COMMENT_RE.sub("", text)
    lowered = text.casefold()
    if "<!" in text or "<?" in text:
        raise web.HTTPBadRequest(
            text=(
                f"{filename} contains unsupported doctypes, entity declarations, "
                "or processing instructions."
            )
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
            if local_attr in {"src", "class"}:
                continue
            if local_attr not in SAFE_SVG_ATTRS:
                continue
            if local_attr == "id" and not SAFE_SVG_ID_RE.fullmatch(value):
                continue
            if local_attr == "href":
                if not SAFE_SVG_FRAGMENT_REF_RE.fullmatch(value):
                    continue
                clean_attrs[local_attr] = value
                continue
            allow_local_ref_value = local_attr in {"fill", "stroke", "filter"}
            if _svg_value_is_unsafe(value, allow_local_ref=allow_local_ref_value):
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


def _sanitize_catalogued_piece_svg(raw: bytes, filename: str) -> str:
    return _sanitize_catalogued_svg(raw, filename, MAX_CATALOGUED_PIECE_SVG_BYTES)


def _parse_svg_view_box_size(svg: str, filename: str) -> tuple[float, float]:
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise web.HTTPBadRequest(text=f"{filename} is not a valid SVG file.") from exc

    raw_view_box = str(root.attrib.get("viewBox") or "").strip()
    if not raw_view_box:
        raise web.HTTPBadRequest(text=f"{filename} must define a viewBox.")

    parts = [part for part in re.split(r"[\s,]+", raw_view_box) if part]
    if len(parts) != 4:
        raise web.HTTPBadRequest(text=f"{filename} has an invalid viewBox.")

    try:
        _min_x, _min_y, width, height = (float(part) for part in parts)
    except ValueError as exc:
        raise web.HTTPBadRequest(text=f"{filename} has an invalid viewBox.") from exc

    if width <= 0 or height <= 0:
        raise web.HTTPBadRequest(text=f"{filename} viewBox must have positive width and height.")
    return width, height


def _sanitize_catalogued_board_svg(raw: bytes, filename: str, width: int, height: int) -> str:
    sanitized = _sanitize_catalogued_svg(raw, filename, MAX_CATALOGUED_BOARD_SVG_BYTES)
    view_box_width, view_box_height = _parse_svg_view_box_size(sanitized, filename)
    expected_ratio = width / height
    actual_ratio = view_box_width / view_box_height
    ratio_delta = abs(actual_ratio - expected_ratio) / expected_ratio
    if ratio_delta > CATALOGUED_BOARD_ASPECT_RATIO_TOLERANCE:
        raise web.HTTPBadRequest(
            text=(f"{filename} viewBox aspect ratio does not match the {width}x{height} board.")
        )
    return sanitized


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


def _catalogued_board_svg_css(variant_name: str, board_svg: Mapping[str, Any]) -> str:
    svg = str(board_svg.get("svg") or "")
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    image = f'url("data:image/svg+xml;base64,{encoded}")'
    selector = f'[data-board-variant="{variant_name}"] cg-board'
    preview_selector = f'[data-board-variant="{variant_name}"].catalogued-board-preview-surface'
    settings_preview_selector = (
        f'label.board.catalogued-custom-board-preview[data-board-variant="{variant_name}"]'
    )
    return (
        f"{selector}, {preview_selector}, {settings_preview_selector} {{\n"
        f"  background-image: {image} !important;\n"
        "  background-size: 100% 100% !important;\n"
        "  background-repeat: no-repeat !important;\n"
        "  background-position: center center !important;\n"
        "}\n"
    )


def _has_complete_piece_set(doc: Mapping[str, Any]) -> bool:
    piece_set = doc.get("pieceSet")
    if not isinstance(piece_set, Mapping):
        return False
    return {
        _catalogued_piece_set_storage_key(str(key)) for key in piece_set
    } == _catalogued_piece_set_required_keys(doc)


def _copy_piece_set_if_complete_for_doc(
    target_doc: CataloguedVariantDocument, source_doc: Mapping[str, Any]
) -> None:
    piece_set = source_doc.get("pieceSet")
    if not isinstance(piece_set, Mapping):
        return

    candidate = dict(target_doc)
    candidate["pieceSet"] = piece_set
    if not _has_complete_piece_set(candidate):
        return

    target_doc["pieceSet"] = cast(dict[str, CataloguedVariantPieceSetSvg], dict(piece_set))
    updated_at = source_doc.get("pieceSetUpdatedAt")
    if isinstance(updated_at, datetime):
        target_doc["pieceSetUpdatedAt"] = updated_at


def _has_board_svg(doc: Mapping[str, Any]) -> bool:
    board_svg = doc.get("boardSvg")
    return isinstance(board_svg, Mapping) and bool(board_svg.get("svg"))


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
    _ensure_catalogued_rules_supported(ini)

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
    variant_info = json.loads(sf.variant_info(name))
    print(json.dumps({"ok": True, "startFen": start_fen, "variantInfo": variant_info}))
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
        variant_info = payload.get("variantInfo")
        if not isinstance(variant_info, Mapping):
            raise ValueError("missing variantInfo")
        _ensure_resolved_catalogued_rules_supported(variant_info)
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
        raise web.HTTPConflict(
            text="This variant name conflicts with an existing built-in variant."
        )

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


def validate_catalogued_ini(ini: str) -> CataloguedVariantValidation:
    _ensure_catalogued_ini_size(ini)
    _ensure_catalogued_rules_supported(ini)
    name = extract_variant_name(ini)

    try:
        sf.load_variant_config(ini)
        fsf_variant_info = _resolved_variant_info(name)
        _ensure_resolved_catalogued_rules_supported(fsf_variant_info)
        derived = derive_catalogued_variant_info(fsf_variant_info)
    except web.HTTPException:
        raise
    except Exception:
        log.info("Fairy-Stockfish rejected catalogued variant %s", name, exc_info=True)
        raise web.HTTPBadRequest(text="Fairy-Stockfish rejected this variant definition.") from None

    _catalogued_grand_from_dimensions(derived.width, derived.height)

    return CataloguedVariantValidation(
        name,
        derived.start_fen,
        derived.width,
        derived.height,
        derived.pieces,
        derived.king_roles,
        derived.pocket_roles,
        derived.capture_to_hand,
        derived.promotion_type,
        derived.promotion_roles,
        derived.promotion_order,
        derived.show_promoted,
        derived.rules_gate,
        derived.rules_pass,
        derived.legal_moves_need_history,
        derived.n_fold_is_draw,
        derived.show_check_counters,
        extract_variant_base_name(ini),
        fsf_variant_info,
    )


def _client_doc(
    doc: Mapping[str, Any],
    *,
    game_count: int | None = None,
    favorite_names: set[str] | None = None,
) -> CataloguedVariantClientDocument:
    description = str(doc.get("description") or "")
    tooltip = description or "Catalogued variant"
    fsf_variant_info = _stored_variant_info(doc)
    if fsf_variant_info:
        derived = derive_catalogued_variant_info(fsf_variant_info)
        start_fen = derived.start_fen
        base_variant = str(doc.get("baseVariant") or derived.template)
        width = derived.width
        height = derived.height
        pieces = derived.pieces
        king_roles = derived.king_roles
        pocket_roles = derived.pocket_roles
        capture_to_hand = derived.capture_to_hand
        promotion_type = derived.promotion_type
        promotion_roles = derived.promotion_roles
        promotion_order = derived.promotion_order
        show_promoted = derived.show_promoted
        rules_gate = derived.rules_gate
        rules_pass = derived.rules_pass
        show_check_counters = derived.show_check_counters
    else:
        # Legacy archived documents can be returned before the startup migration
        # has reloaded them. Use only their stored projection; never reinterpret INI.
        start_fen = str(doc["startFen"])
        base_variant = str(doc.get("baseVariant") or "")
        width = int(doc["width"])
        height = int(doc["height"])
        pieces = list(doc.get("pieces") or ["k"])
        king_roles = list(doc.get("kingRoles") or [])
        pocket_roles = list(doc.get("pocketRoles") or [])
        capture_to_hand = bool(doc.get("captureToHand", False))
        promotion_type = str(doc.get("promotionType") or "regular")
        promotion_roles = list(doc.get("promotionRoles") or [])
        promotion_order = list(doc.get("promotionOrder") or [])
        show_promoted = bool(doc.get("showPromoted", False))
        rules_gate = bool(doc.get("rulesGate", False))
        rules_pass = bool(doc.get("rulesPass", False))
        show_check_counters = bool(doc.get("showCheckCounters", False))

    client_doc: CataloguedVariantClientDocument = {
        "name": str(doc["name"]),
        "displayName": str(doc.get("displayName") or doc["name"]),
        "tooltip": tooltip,
        "ini": str(doc.get("ini") or ""),
        "baseVariant": base_variant,
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": pieces,
        "kingRoles": king_roles,
        "pocketRoles": pocket_roles,
        "captureToHand": capture_to_hand,
        "promotionType": promotion_type,
        "promotionRoles": promotion_roles,
        "promotionOrder": promotion_order,
        "showPromoted": show_promoted,
        "rulesGate": rules_gate,
        "rulesPass": rules_pass,
        "showCheckCounters": show_check_counters,
        "icon": str(doc.get("icon") or CATALOGUED_ICON),
        "category": CATALOGUED_CATEGORY,
        "author": str(doc.get("author") or ""),
        "source": _catalogued_source(doc),
        "system": _is_fsf_builtin_catalogued_doc(doc),
        "visibility": _catalogued_visibility(doc),
        "hasPieceSet": _has_complete_piece_set(doc),
        "hasBoard": _has_board_svg(doc),
        "archived": bool(doc.get("archived", False)),
        "enabled": bool(doc.get("enabled", True)),
    }
    if fsf_variant_info:
        client_doc["fsfVariantInfo"] = fsf_variant_info
    if _is_fsf_builtin_catalogued_doc(doc):
        client_doc["fsfBuiltinVariant"] = _fsf_builtin_variant_name(doc)
        references = _catalogued_references_for_display(doc)
        if references:
            client_doc["references"] = references
    piece_family_override = _catalogued_piece_family_override(doc)
    if piece_family_override:
        client_doc["pieceFamilyOverride"] = piece_family_override
    if client_doc["hasPieceSet"]:
        client_doc["pieceSetRevision"] = _piece_set_revision(doc)
    if client_doc["hasBoard"]:
        client_doc["boardRevision"] = _board_svg_revision(doc)
    ai_disabled_until = catalogued_variant_ai_disabled_until(doc)
    if ai_disabled_until is not None:
        client_doc["aiDisabled"] = True
        client_doc["aiDisabledUntil"] = ai_disabled_until
        if doc.get("aiDisabledReason"):
            client_doc["aiDisabledReason"] = str(doc["aiDisabledReason"])
    if favorite_names is not None and str(client_doc["name"]) in favorite_names:
        client_doc["favorite"] = True
    if game_count is not None:
        client_doc["gameCount"] = game_count
        client_doc["locked"] = game_count > 0
    elif "gameCount" in doc:
        client_doc["gameCount"] = int(doc.get("gameCount") or 0)
    return client_doc


def _is_active_catalogued_game_participant(
    app_state: Any,
    name: str,
    username: str | None,
) -> bool:
    if not username:
        return False
    for game in getattr(app_state, "games", {}).values():
        if getattr(game, "variant", None) != name or getattr(game, "status", STARTED) > STARTED:
            continue
        if username in {
            str(getattr(getattr(game, "wplayer", None), "username", "")),
            str(getattr(getattr(game, "bplayer", None), "username", "")),
        }:
            return True
    return False


async def find_catalogued_variant_doc(
    app_state: Any,
    name: str,
    username: str | None = None,
) -> Mapping[str, Any] | None:
    docs = getattr(app_state, "catalogued_variants", {})
    doc = docs.get(name)
    if doc is None and app_state.db is not None:
        doc = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if doc is None:
        return None
    if _can_open_catalogued_doc(username, doc) or _is_active_catalogued_game_participant(
        app_state, name, username
    ):
        return doc
    return None


def catalogued_variant_client_doc_for_name(
    app_state: Any,
    name: str,
    username: str | None = None,
) -> CataloguedVariantClientDocument | None:
    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None or not _can_open_catalogued_doc(username, doc):
        return None
    return _client_doc(doc)


async def catalogued_variant_client_doc_for_game(
    app_state: Any,
    game: Any,
    username: str,
) -> CataloguedVariantClientDocument | None:
    """Return variant metadata needed by a participant's existing game.

    Existing games must remain renderable after their catalogued variant becomes
    private, unlisted, or archived.  This deliberately bypasses normal catalogue
    visibility checks, but only after verifying that ``username`` is one of the
    game's players.
    """

    if not username or username not in {
        str(getattr(getattr(game, "wplayer", None), "username", "")),
        str(getattr(getattr(game, "bplayer", None), "username", "")),
    }:
        return None

    if not isinstance(getattr(game, "server_variant", None), CataloguedServerVariant):
        return None

    name = str(getattr(game, "variant", ""))
    if not name:
        return None

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None and getattr(app_state, "db", None) is not None:
        doc = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if doc is None:
        return None
    return _client_doc(doc)


def can_create_catalogued_seek(app_state: Any, name: str, username: str | None) -> bool:
    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return False
    return _can_open_catalogued_doc(username, doc)


def is_public_catalogued_variant(app_state: Any, name: str) -> bool:
    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return False
    return (
        _is_active_catalogued_doc(doc)
        and _catalogued_visibility(doc) == CATALOGUED_VISIBILITY_PUBLIC
    )


def catalogued_variant_allows_fishnet(app_state: Any, name: str) -> bool:
    """Return whether Fairy-Stockfish/fishnet should currently handle this variant."""

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return not is_catalogued_variant(name)
    return not catalogued_variant_ai_disabled(doc)


async def record_catalogued_variant_ai_failure(
    app_state: Any,
    name: str,
    reason: str,
) -> bool:
    """Record a fishnet engine failure and quarantine the variant after repeated failures.

    Returns True when this call put the variant into the temporary AI-disabled state.
    """

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return False

    now = datetime.now(timezone.utc)
    failure_count = int(doc.get("aiFailureCount") or 0) + 1
    update_set: dict[str, Any] = {
        "aiFailureCount": failure_count,
        "aiLastFailureAt": now,
        "aiLastFailureReason": reason,
    }
    disabled = failure_count >= CATALOGUED_AI_FAILURE_LIMIT
    if disabled:
        update_set.update(
            {
                "aiDisabledAt": now,
                "aiDisabledUntil": now + timedelta(seconds=CATALOGUED_AI_DISABLE_SECONDS),
                "aiDisabledReason": reason,
            }
        )

    if getattr(app_state, "db", None) is not None:
        try:
            await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
                {"_id": name}, {"$set": update_set}
            )
        except Exception:
            log.exception("Failed to persist catalogued variant AI failure for %s", name)

    doc.update(update_set)
    if disabled:
        log.warning(
            "Temporarily disabled Fairy-Stockfish AI for catalogued variant %s after %s failures "
            "(latest reason=%s)",
            name,
            failure_count,
            reason,
        )
    return disabled


async def clear_catalogued_variant_ai_failures(app_state: Any, name: str) -> None:
    """Clear transient fishnet AI failure/quarantine fields after successful engine work."""

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        return

    fields = {
        "aiFailureCount",
        "aiLastFailureAt",
        "aiLastFailureReason",
        "aiDisabledAt",
        "aiDisabledUntil",
        "aiDisabledReason",
    }
    if not any(field in doc for field in fields):
        return

    if getattr(app_state, "db", None) is not None:
        try:
            await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
                {"_id": name}, {"$unset": {field: "" for field in fields}}
            )
        except Exception:
            log.exception("Failed to clear catalogued variant AI failure fields for %s", name)

    for field in fields:
        doc.pop(field, None)


def public_catalogued_variants_for_forms(app_state: Any) -> dict[str, Any]:
    """Return public uploaded variants that are safe in durable site events."""

    docs = getattr(app_state, "catalogued_variants", {})
    return {
        name: get_server_variant(name, False)
        for name, doc in sorted(
            docs.items(),
            key=lambda item: str(item[1].get("displayName", item[0])).casefold(),
        )
        if is_public_catalogued_variant(app_state, name)
    }


def catalogued_variant_rule_context(doc: Mapping[str, Any]) -> dict[str, Any]:
    fsf_variant_info = _stored_variant_info(doc)
    if fsf_variant_info:
        derived = derive_catalogued_variant_info(fsf_variant_info)
        start_fen = derived.start_fen
        width = derived.width
        height = derived.height
        pieces = derived.pieces
        pocket_roles = derived.pocket_roles
        promotion_roles = derived.promotion_roles
        capture_to_hand = derived.capture_to_hand
    else:
        start_fen = str(doc.get("startFen") or "")
        width = int(doc.get("width") or 8)
        height = int(doc.get("height") or 8)
        pieces = list(doc.get("pieces") or [])
        pocket_roles = list(doc.get("pocketRoles") or [])
        promotion_roles = list(doc.get("promotionRoles") or [])
        capture_to_hand = bool(doc.get("captureToHand", False))

    return {
        "name": str(doc.get("name") or doc.get("_id") or ""),
        "displayName": str(
            doc.get("displayName") or doc.get("name") or doc.get("_id") or "Catalogued variant"
        ),
        "description": str(doc.get("description") or ""),
        "author": str(doc.get("author") or ""),
        "references": _catalogued_references_for_display(doc),
        "ini": str(doc.get("ini") or ""),
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": ", ".join(pieces),
        "pocketRoles": ", ".join(pocket_roles),
        "promotionRoles": ", ".join(promotion_roles),
        "captureToHand": capture_to_hand,
        "enabled": bool(doc.get("enabled", True)),
        "archived": bool(doc.get("archived", False)),
        "visibility": _catalogued_visibility(doc),
        "ruleSummary": catalogued_rule_summary(doc),
        "customPieceDiagrams": catalogued_betza_diagrams(doc),
        "startBoardPreview": catalogued_start_board_preview(doc),
    }


def catalogued_variants_for_client(
    app_state: Any,
    username: str | None = None,
    favorite_names: set[str] | None = None,
) -> list[CataloguedVariantClientDocument]:
    docs = getattr(app_state, "catalogued_variants", {})
    return [
        _client_doc(doc, favorite_names=favorite_names)
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
) -> dict[str, Any]:
    name = str(doc["name"])
    runtime_doc = dict(doc)
    if not _is_active_catalogued_doc(runtime_doc):
        getattr(app_state, "catalogued_variants", {}).pop(name, None)
        unregister_catalogued_server_variant(name)
        return runtime_doc

    ini = str(runtime_doc.get("ini") or "")
    is_fsf_builtin = _is_fsf_builtin_catalogued_doc(runtime_doc)
    if not is_fsf_builtin:
        _ensure_catalogued_rules_supported(ini)

    if load_config:
        if not is_fsf_builtin:
            sf.load_variant_config(ini)
        # Re-resolve active variants with the running Fairy-Stockfish build.
        # This backfills old documents and refreshes metadata if the engine's
        # parser/exporter semantics changed without a catalogue edit.
        fsf_variant_info = _resolved_variant_info(name)
    else:
        try:
            fsf_variant_info = validate_fsf_variant_info(
                runtime_doc.get("fsfVariantInfo"), expected_name=name
            )
        except FsfVariantInfoError:
            fsf_variant_info = _resolved_variant_info(name)
    if not is_fsf_builtin:
        _ensure_resolved_catalogued_rules_supported(fsf_variant_info)
    runtime_doc.update(catalogued_variant_derived_fields(fsf_variant_info))

    width = int(runtime_doc["width"])
    height = int(runtime_doc["height"])
    board_info = fsf_mapping(fsf_variant_info.get("board"))
    register_catalogued_server_variant(
        name,
        str(runtime_doc.get("displayName") or name),
        str(runtime_doc.get("icon") or CATALOGUED_ICON),
        chess960=bool(board_info.get("chess960")),
        grand=_catalogued_grand_from_dimensions(width, height),
        two_boards=bool(board_info.get("twoBoards")),
        base_variant=str(runtime_doc.get("baseVariant") or ""),
        extended_move_codec=_catalogued_extended_move_codec_from_dimensions(width, height),
        show_promoted=bool(runtime_doc["showPromoted"]),
        legal_moves_need_history=bool(runtime_doc["legalMovesNeedHistory"]),
        n_fold_is_draw=bool(runtime_doc["nFoldIsDraw"]),
        fsf_variant_info=fsf_variant_info,
    )
    app_state.catalogued_variants[name] = runtime_doc
    return runtime_doc


def ensure_catalogued_variant_from_game_doc(app_state: Any, doc: Mapping[str, Any]) -> None:
    """Load an inline variant definition saved with a historical game if needed."""
    code = str(doc.get("v") or "")
    if not code or is_catalogued_variant(code) or not doc.get("vini"):
        return

    validated = validate_catalogued_ini(str(doc["vini"]))
    name = validated.name
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
            "baseVariant": validated.base_variant,
            "enabled": True,
            "archived": False,
            "startFen": validated.start_fen,
            "width": validated.width,
            "height": validated.height,
            "pieces": validated.pieces,
            "kingRoles": validated.king_roles,
            "pocketRoles": validated.pocket_roles,
            "captureToHand": validated.capture_to_hand,
            "promotionType": validated.promotion_type,
            "promotionRoles": validated.promotion_roles,
            "promotionOrder": validated.promotion_order,
            "showPromoted": validated.show_promoted,
            "rulesGate": validated.rules_gate,
            "rulesPass": validated.rules_pass,
            "legalMovesNeedHistory": validated.legal_moves_need_history,
            "nFoldIsDraw": validated.n_fold_is_draw,
            "showCheckCounters": validated.show_check_counters,
            "fsfVariantInfo": validated.fsf_variant_info,
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
    await collection.create_index("source")

    await ensure_fsf_catalogued_builtin_variants(app_state)

    cursor = collection.find({"enabled": {"$ne": False}, "archived": {"$ne": True}})
    async for doc in cursor:
        try:
            registered = register_catalogued_variant_doc(app_state, doc)
            synced = catalogued_variant_derived_fields(registered["fsfVariantInfo"])
            if any(doc.get(key) != value for key, value in synced.items()):
                synced["updatedAt"] = doc.get("updatedAt", datetime.now(timezone.utc))
                await collection.update_one({"_id": doc["_id"]}, {"$set": synced})
        except web.HTTPException as exc:
            log.warning(
                "Skipped catalogued variant %s: %s",
                doc.get("name"),
                exc.text or exc.reason,
            )
        except Exception:
            log.exception("Failed to load catalogued variant %s", doc.get("name"))


async def get_catalogued_variants(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _optional_human_username(request)
    favorite_names: set[str] | None = None
    if username is not None:
        user = await app_state.users.get(username)
        favorite_names = _clean_favorite_names(getattr(user, "catalogued_variant_favorites", set()))
    return json_response(
        {
            "variants": catalogued_variants_for_client(
                app_state, username, favorite_names=favorite_names
            )
        }
    )


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


def catalogued_variant_games_are_persisted(app_state: Any, name: str) -> bool:
    """Return whether newly created games for this catalogued variant are saved.

    The decision is intentionally made at game creation time. Public variants
    create durable games; private and unlisted variants are test/sandbox
    variants whose games remain in memory only.
    """

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is None:
        # Preserve the old behaviour for unexpected/migrating runtime state.
        return True
    return _catalogued_visibility(doc) == CATALOGUED_VISIBILITY_PUBLIC


def _has_active_catalogued_games(app_state: Any, name: str) -> bool:
    for game in getattr(app_state, "games", {}).values():
        if getattr(game, "variant", None) == name and getattr(game, "status", STARTED) <= STARTED:
            return True
    return False


async def increment_catalogued_variant_game_count(app_state: Any, name: str) -> None:
    """Increment the stored played-game counter for a saved catalogued game."""

    if app_state.db is None or not _is_valid_variant_name(name):
        return

    result = await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name}, {"$inc": {"gameCount": 1}}
    )
    if not result.matched_count:
        return

    doc = getattr(app_state, "catalogued_variants", {}).get(name)
    if doc is not None:
        doc["gameCount"] = int(doc.get("gameCount") or 0) + 1


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
    favorite_names: set[str] | None = None,
    favorites_only: bool = False,
) -> dict[str, Any]:
    q = q.strip()[:80]
    author = author.strip()[:40]
    page = max(1, page)
    can_favorite = favorite_names is not None
    favorite_names = _clean_favorite_names(favorite_names or set())
    favorites_only = favorites_only and can_favorite

    if app_state.db is None:
        return {
            "variants": [],
            "q": q,
            "author": author,
            "sort": sort,
            "favoritesOnly": favorites_only,
            "canFavorite": can_favorite,
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
    if favorites_only:
        if favorite_names:
            query["name"] = {"$in": sorted(favorite_names)}
        else:
            return {
                "variants": [],
                "q": q,
                "author": author,
                "sort": sort,
                "favoritesOnly": favorites_only,
                "canFavorite": can_favorite,
                "page": 1,
                "pages": 1,
                "total": 0,
                "prev_page": None,
                "next_page": None,
            }

    use_favorite_sort = sort == "favorites" and can_favorite
    if sort == "name":
        sort_spec = [("displayName", 1), ("name", 1)]
    elif sort == "newest":
        sort_spec = [("createdAt", -1), ("name", 1)]
    elif sort == "played":
        sort_spec = [("gameCount", -1), ("updatedAt", -1), ("name", 1)]
    elif use_favorite_sort:
        sort_spec = [("updatedAt", -1), ("name", 1)]
    else:
        sort = "updated"
        sort_spec = [("updatedAt", -1), ("name", 1)]

    total = await app_state.db[CATALOGUED_VARIANT_COLLECTION].count_documents(query)
    pages = max(1, (total + CATALOGUED_COMMUNITY_PAGE_SIZE - 1) // CATALOGUED_COMMUNITY_PAGE_SIZE)
    page = min(page, pages)
    skip = (page - 1) * CATALOGUED_COMMUNITY_PAGE_SIZE

    variants: list[dict[str, Any]] = []
    if use_favorite_sort:
        cursor = await app_state.db[CATALOGUED_VARIANT_COLLECTION].aggregate(
            [
                {"$match": query},
                {
                    "$addFields": {
                        "favoriteSort": {
                            "$cond": [{"$in": ["$name", sorted(favorite_names)]}, 0, 1]
                        }
                    }
                },
                {"$sort": {"favoriteSort": 1, "updatedAt": -1, "name": 1}},
                {"$skip": skip},
                {"$limit": CATALOGUED_COMMUNITY_PAGE_SIZE},
            ]
        )
    else:
        cursor = (
            app_state.db[CATALOGUED_VARIANT_COLLECTION]
            .find(query)
            .sort(sort_spec)
            .skip(skip)
            .limit(CATALOGUED_COMMUNITY_PAGE_SIZE)
        )
    async for doc in cursor:
        name = str(doc.get("name") or doc.get("_id") or "")
        count = int(doc.get("gameCount") or 0)
        variants.append(
            {
                "name": name,
                "displayName": str(doc.get("displayName") or name),
                "description": str(doc.get("description") or ""),
                "author": str(doc.get("author") or ""),
                "references": _catalogued_references_for_display(doc),
                "width": int(doc.get("width") or 0),
                "height": int(doc.get("height") or 0),
                "gameCount": count,
                "updatedAt": doc.get("updatedAt"),
                "favorite": name in favorite_names,
                "startBoardPreview": catalogued_start_board_preview(doc),
            }
        )

    return {
        "variants": variants,
        "q": q,
        "author": author,
        "sort": sort,
        "favoritesOnly": favorites_only,
        "canFavorite": can_favorite,
        "page": page,
        "pages": pages,
        "total": total,
        "prev_page": page - 1 if page > 1 else None,
        "next_page": page + 1 if page < pages else None,
    }


async def set_catalogued_variant_favorite(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _current_human_username(request)
    name = request.match_info["name"]
    if not _is_valid_variant_name(name):
        raise web.HTTPBadRequest(text=VARIANT_NAME_ERROR)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    doc = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one(
        {"_id": name, **_catalogued_public_query()}, projection={"_id": 1}
    )
    if doc is None:
        raise web.HTTPNotFound(text="Public catalogued variant not found.")

    data = await read_json_data(request)
    if not isinstance(data, Mapping):
        raise web.HTTPBadRequest(text="Expected JSON object.")
    favorite = bool(data.get("favorite"))

    user = await app_state.users.get(username)
    favorites = _clean_favorite_names(getattr(user, "catalogued_variant_favorites", set()))
    if favorite:
        if name not in favorites and len(favorites) >= MAX_CATALOGUED_FAVORITES_PER_USER:
            raise web.HTTPConflict(
                text=f"You can favorite at most {MAX_CATALOGUED_FAVORITES_PER_USER} variants."
            )
        favorites.add(name)
        await app_state.db.user.update_one({"_id": username}, {"$addToSet": {"cvf": name}})
    else:
        favorites.discard(name)
        await app_state.db.user.update_one({"_id": username}, {"$pull": {"cvf": name}})

    user.catalogued_variant_favorites = favorites
    return json_response({"ok": True, "name": name, "favorite": favorite})


async def _read_upload_payload(request: web.Request) -> tuple[str, str, str, str, str]:
    content_type = request.content_type or ""

    if content_type == "application/json":
        data = await read_json_data(request)
        if not isinstance(data, Mapping):
            raise web.HTTPBadRequest(text="Expected JSON object.")
        ini = str(data.get("ini") or "")
        display_name = str(data.get("displayName") or data.get("display_name") or "")
        description = str(data.get("description") or "")
        piece_family_override = _read_piece_family_override(data)
        visibility = _clean_visibility(str(data.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE))
        return ini, display_name, description, piece_family_override, visibility

    if content_type.startswith("text/"):
        ini = await read_text_data(request)
        return ini or "", "", "", "", CATALOGUED_VISIBILITY_PRIVATE

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
    piece_family_override = _read_piece_family_override(data)
    visibility = _clean_visibility(str(data.get("visibility") or CATALOGUED_VISIBILITY_PRIVATE))
    return ini, display_name, description, piece_family_override, visibility


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
    base_variant: str,
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
    promotion_type: str,
    promotion_roles: list[str],
    promotion_order: list[str],
    show_promoted: bool,
    rules_gate: bool,
    rules_pass: bool,
    legal_moves_need_history: bool,
    n_fold_is_draw: bool,
    show_check_counters: bool,
    fsf_variant_info: dict[str, Any],
    created_at: datetime,
    visibility: str = CATALOGUED_VISIBILITY_PRIVATE,
    piece_family_override: str = "",
    archived: bool = False,
    game_count: int = 0,
    source: str = CATALOGUED_SOURCE_USER,
    fsf_builtin_variant: str | None = None,
) -> CataloguedVariantDocument:
    doc: CataloguedVariantDocument = {
        "_id": name,
        "name": name,
        "displayName": _clean_display_name(display_name, name),
        "description": _clean_description(description),
        "author": username,
        "ini": ini,
        "baseVariant": base_variant,
        "enabled": not archived,
        "archived": archived,
        "startFen": start_fen,
        "width": width,
        "height": height,
        "pieces": pieces,
        "kingRoles": king_roles,
        "pocketRoles": pocket_roles,
        "captureToHand": capture_to_hand,
        "promotionType": promotion_type,
        "promotionRoles": promotion_roles,
        "promotionOrder": promotion_order,
        "showPromoted": show_promoted,
        "rulesGate": rules_gate,
        "rulesPass": rules_pass,
        "legalMovesNeedHistory": legal_moves_need_history,
        "nFoldIsDraw": n_fold_is_draw,
        "showCheckCounters": show_check_counters,
        "fsfVariantInfo": fsf_variant_info,
        "icon": CATALOGUED_ICON,
        "category": CATALOGUED_CATEGORY,
        "visibility": _clean_visibility(visibility),
        "source": source,
        "gameCount": max(0, int(game_count)),
        "createdAt": created_at,
        "updatedAt": datetime.now(timezone.utc),
    }
    if piece_family_override:
        doc["pieceFamilyOverride"] = _clean_piece_family_override(piece_family_override)
    if fsf_builtin_variant:
        doc["fsfBuiltinVariant"] = fsf_builtin_variant
    return doc


def _clean_catalogued_reference(value: Any) -> CataloguedVariantReference | None:
    if not isinstance(value, Mapping):
        return None

    url = str(value.get("url") or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None

    label = str(value.get("label") or "").strip()[:80] or _reference_label_for_url(url)
    return {"label": label, "url": url}


def _clean_catalogued_references(value: Any) -> list[CataloguedVariantReference]:
    if not isinstance(value, (list, tuple)):
        return []

    seen: set[str] = set()
    references: list[CataloguedVariantReference] = []
    for item in value:
        reference = _clean_catalogued_reference(item)
        if reference is None or reference["url"] in seen:
            continue
        seen.add(reference["url"])
        references.append(reference)
    return references


def _fsf_legacy_reference_description(references: list[CataloguedVariantReference]) -> str:
    if not references:
        return FSF_CATALOGUED_BUILTIN_DESCRIPTION
    urls = ", ".join(reference["url"] for reference in references)
    return f"{FSF_CATALOGUED_BUILTIN_DESCRIPTION} Reference: {urls}"


def _fsf_builtin_description_is_auto(
    description: str, metadata: Mapping[str, Any], references: list[CataloguedVariantReference]
) -> bool:
    metadata_description = str(metadata.get("description") or FSF_CATALOGUED_BUILTIN_DESCRIPTION)
    return not description or description in {
        FSF_CATALOGUED_BUILTIN_DESCRIPTION,
        metadata_description,
        _fsf_legacy_reference_description(references),
    }


def _catalogued_references_for_display(doc: Mapping[str, Any]) -> list[CataloguedVariantReference]:
    if not _is_fsf_builtin_catalogued_doc(doc):
        return []
    return _clean_catalogued_references(doc.get("references"))


def _fsf_builtin_description_for_doc(
    metadata: Mapping[str, Any],
    existing: Mapping[str, Any] | None,
    references: list[CataloguedVariantReference],
) -> str:
    metadata_description = str(metadata.get("description") or FSF_CATALOGUED_BUILTIN_DESCRIPTION)
    existing_description = str((existing or {}).get("description") or "")
    if _fsf_builtin_description_is_auto(existing_description, metadata, references):
        return metadata_description
    return existing_description


def _build_fsf_builtin_doc(
    name: str,
    metadata: Mapping[str, Any],
    *,
    existing: Mapping[str, Any] | None = None,
) -> CataloguedVariantDocument:
    fsf_variant_info = _resolved_variant_info(name)
    derived = derive_catalogued_variant_info(fsf_variant_info)
    _catalogued_grand_from_dimensions(derived.width, derived.height)
    references = _clean_catalogued_references(metadata.get("references"))

    doc = _build_doc(
        name=name,
        base_variant=str(metadata.get("baseVariant") or derived.template),
        display_name=str(
            (existing or {}).get("displayName") or metadata.get("displayName") or name
        ),
        description=_fsf_builtin_description_for_doc(metadata, existing, references),
        username=CATALOGUED_FSF_BUILTIN_AUTHOR,
        ini="",
        start_fen=derived.start_fen,
        width=derived.width,
        height=derived.height,
        pieces=derived.pieces,
        king_roles=derived.king_roles,
        pocket_roles=derived.pocket_roles,
        capture_to_hand=derived.capture_to_hand,
        promotion_type=derived.promotion_type,
        promotion_roles=derived.promotion_roles,
        promotion_order=derived.promotion_order,
        show_promoted=derived.show_promoted,
        rules_gate=derived.rules_gate,
        rules_pass=derived.rules_pass,
        legal_moves_need_history=derived.legal_moves_need_history,
        n_fold_is_draw=derived.n_fold_is_draw,
        show_check_counters=derived.show_check_counters,
        fsf_variant_info=fsf_variant_info,
        created_at=cast(datetime, (existing or {}).get("createdAt") or datetime.now(timezone.utc)),
        visibility=str((existing or {}).get("visibility") or CATALOGUED_VISIBILITY_PUBLIC),
        archived=bool((existing or {}).get("archived", False)),
        game_count=int((existing or {}).get("gameCount") or 0),
        source=CATALOGUED_SOURCE_FSF_BUILTIN,
        fsf_builtin_variant=name,
    )
    doc["references"] = references
    return doc


def _fsf_builtin_synced_fields(doc: Mapping[str, Any]) -> dict[str, Any]:
    """Fields controlled by the server-side curated FSF built-in list.

    Admin-editable metadata (displayName, description, visibility), assets,
    counters and AI-disable state are intentionally not overwritten at startup.
    Startup seeding may separately replace only the old generic description.
    """

    keys = (
        "name",
        "author",
        "ini",
        "baseVariant",
        "enabled",
        "startFen",
        "width",
        "height",
        "pieces",
        "kingRoles",
        "pocketRoles",
        "captureToHand",
        "promotionType",
        "promotionRoles",
        "promotionOrder",
        "showPromoted",
        "rulesGate",
        "rulesPass",
        "legalMovesNeedHistory",
        "nFoldIsDraw",
        "showCheckCounters",
        "fsfVariantInfo",
        "icon",
        "category",
        "source",
        "fsfBuiltinVariant",
        "references",
    )
    return {key: doc[key] for key in keys if key in doc}


async def ensure_fsf_catalogued_builtin_variants(app_state: Any) -> None:
    if app_state.db is None:
        return

    collection = app_state.db[CATALOGUED_VARIANT_COLLECTION]
    for name, metadata in FSF_CATALOGUED_BUILTIN_VARIANTS.items():
        if name not in BUILTIN_FSF_VARIANT_NAMES:
            log.warning(
                "Skipped FSF catalogued built-in %s: Fairy-Stockfish does not know it", name
            )
            continue

        existing = await collection.find_one({"_id": name})
        if existing is not None and not _is_fsf_builtin_catalogued_doc(existing):
            log.warning(
                "Skipped FSF catalogued built-in %s: a non-system catalogued variant already uses that key",
                name,
            )
            continue

        try:
            doc = _build_fsf_builtin_doc(name, metadata, existing=existing)
        except Exception:
            log.exception("Failed to prepare FSF catalogued built-in %s", name)
            continue

        if existing is None:
            try:
                await collection.insert_one(doc)
            except DuplicateKeyError:
                log.warning("Skipped FSF catalogued built-in %s: duplicate key", name)
            continue

        synced_fields = _fsf_builtin_synced_fields(doc)
        existing_description = str(existing.get("description") or "")
        references = _clean_catalogued_references(doc.get("references"))
        if _fsf_builtin_description_is_auto(existing_description, metadata, references):
            synced_fields["description"] = doc["description"]

        await collection.update_one(
            {"_id": name},
            {"$set": synced_fields},
        )


async def upload_catalogued_variant(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _current_human_username(request)
    ini, display_name, description, piece_family_override, visibility = await _read_upload_payload(
        request
    )
    ini = ini.strip()
    await _ensure_catalogued_variant_quota(app_state, username)
    if not ini:
        raise web.HTTPBadRequest(text="Missing INI content.")

    # Check uniqueness before asking FSF to load the config. load_variant_config()
    # is intentionally global and should not be called for a duplicate upload.
    name = extract_variant_name(ini)
    await ensure_catalogued_variant_name_available(app_state, name)
    await check_catalogued_ini_without_mutating_server(ini, name)

    validated = validate_catalogued_ini(ini)
    name = validated.name

    now = datetime.now(timezone.utc)
    doc = _build_doc(
        name=name,
        base_variant=validated.base_variant,
        display_name=display_name,
        description=description,
        username=username,
        ini=ini,
        start_fen=validated.start_fen,
        width=validated.width,
        height=validated.height,
        pieces=validated.pieces,
        king_roles=validated.king_roles,
        pocket_roles=validated.pocket_roles,
        capture_to_hand=validated.capture_to_hand,
        promotion_type=validated.promotion_type,
        promotion_roles=validated.promotion_roles,
        promotion_order=validated.promotion_order,
        show_promoted=validated.show_promoted,
        rules_gate=validated.rules_gate,
        rules_pass=validated.rules_pass,
        legal_moves_need_history=validated.legal_moves_need_history,
        n_fold_is_draw=validated.n_fold_is_draw,
        show_check_counters=validated.show_check_counters,
        fsf_variant_info=validated.fsf_variant_info,
        created_at=now,
        visibility=visibility,
        piece_family_override=piece_family_override if _is_admin_username(username) else "",
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


async def upload_catalogued_board(request: web.Request) -> web.Response:
    app_state, _username, name, doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")
    if not _is_active_catalogued_doc(doc):
        raise web.HTTPConflict(text="Archived variants cannot have custom boards.")

    data = await read_post_data(request)
    if data is None:
        raise web.HTTPBadRequest(text="Missing form data.")

    upload = None
    if hasattr(data, "getall"):
        uploads = []
        uploads.extend(data.getall("board", []))
        uploads.extend(data.getall("file", []))
        uploads.extend(data.getall("files", []))
        if len(uploads) > 1:
            raise web.HTTPBadRequest(text="Upload exactly one board SVG file.")
        upload = uploads[0] if uploads else None
    if upload is None:
        upload = data.get("board") or data.get("file")
    if not hasattr(upload, "file"):
        raise web.HTTPBadRequest(text="Upload exactly one board SVG file.")

    filename = str(getattr(upload, "filename", "") or "board.svg").strip() or "board.svg"
    filename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    filename = unquote(filename).rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if not filename.casefold().endswith(".svg"):
        raise web.HTTPBadRequest(text="Board upload must be an SVG file.")

    raw = upload.file.read(MAX_CATALOGUED_BOARD_SVG_BYTES + 1)
    svg = _sanitize_catalogued_board_svg(raw, filename, int(doc["width"]), int(doc["height"]))
    board_svg: CataloguedVariantBoardSvg = {"svg": svg, "size": len(svg.encode("utf-8"))}

    now = datetime.now(timezone.utc)
    result = await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$set": {"boardSvg": board_svg, "boardSvgUpdatedAt": now, "updatedAt": now}},
    )
    if result.matched_count != 1:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    updated = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if updated is None:
        raise web.HTTPNotFound(text="Catalogued variant not found after update.")
    app_state.catalogued_variants[name] = updated
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(updated, game_count=count)})


async def delete_catalogued_board(request: web.Request) -> web.Response:
    app_state, _username, name, _doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")

    now = datetime.now(timezone.utc)
    result = await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$unset": {"boardSvg": "", "boardSvgUpdatedAt": ""}, "$set": {"updatedAt": now}},
    )
    if result.matched_count != 1:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    updated = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": name})
    if updated is None:
        raise web.HTTPNotFound(text="Catalogued variant not found after update.")
    app_state.catalogued_variants[name] = updated
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(updated, game_count=count)})


async def get_catalogued_board_css(request: web.Request) -> web.Response:
    app_state = get_app_state(request.app)
    username = await _optional_human_username(request)
    name = request.match_info["name"]
    doc = await find_catalogued_variant_doc(app_state, name, username)
    if doc is None:
        raise web.HTTPNotFound(text="Catalogued variant not found.")

    board_svg = doc.get("boardSvg")
    if not isinstance(board_svg, Mapping) or not _has_board_svg(doc):
        raise web.HTTPNotFound(text="This variant has no custom board.")

    return web.Response(
        text=_catalogued_board_svg_css(str(doc["name"]), board_svg),
        content_type="text/css",
        headers={"Cache-Control": "private, max-age=300"},
    )


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
    admin = _is_admin_username(username)
    scope = request.rel_url.query.get("scope")
    if admin and scope == "fsf":
        query: dict[str, Any] = {"source": CATALOGUED_SOURCE_FSF_BUILTIN}
    elif admin and (scope == "all" or request.rel_url.query.get("all") == "1"):
        query = {}
    else:
        query = {"author": username}

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

    ini, display_name, description, piece_family_override, visibility = await _read_upload_payload(
        request
    )
    ini = ini.strip()
    piece_family_override = (
        piece_family_override
        if _is_admin_username(username)
        else _catalogued_piece_family_override(existing)
    )
    if _is_fsf_builtin_catalogued_doc(existing):
        now = datetime.now(timezone.utc)
        update: dict[str, Any] = {
            "$set": {
                "displayName": _clean_display_name(display_name, old_name),
                "description": _clean_description(description),
                "visibility": visibility,
                "updatedAt": now,
            }
        }
        if piece_family_override:
            update["$set"]["pieceFamilyOverride"] = piece_family_override
        else:
            update["$unset"] = {"pieceFamilyOverride": ""}
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one({"_id": old_name}, update)
        updated = await app_state.db[CATALOGUED_VARIANT_COLLECTION].find_one({"_id": old_name})
        if updated is None:
            raise web.HTTPNotFound(text="Catalogued variant not found after update.")
        register_catalogued_variant_doc(app_state, updated, load_config=False)
        count = await _game_count(app_state, old_name)
        return json_response(
            {"ok": True, "oldName": old_name, "variant": _client_doc(updated, game_count=count)}
        )

    if not ini:
        raise web.HTTPBadRequest(text="Missing INI content.")

    new_name = extract_variant_name(ini)
    existing_ini = str(existing.get("ini") or "")
    fsf_rules_changed = ini != existing_ini
    if (fsf_rules_changed or new_name != old_name) and await _has_games(app_state, old_name):
        raise web.HTTPConflict(
            text="This variant already has games. Its rules are locked; clone it to make a changed version."
        )

    if fsf_rules_changed and new_name == old_name:
        raise web.HTTPConflict(
            text=(
                "Changing rules requires a new variant section name because Fairy-Stockfish "
                "cannot replace an already loaded runtime variant. Rename the [section] or clone this variant."
            )
        )

    if new_name != old_name:
        await ensure_catalogued_variant_name_available(app_state, new_name, current_name=old_name)

    if fsf_rules_changed or new_name != old_name:
        await check_catalogued_ini_without_mutating_server(ini, new_name)
        validated = validate_catalogued_ini(ini)
        new_name = validated.name
        base_variant = validated.base_variant
        start_fen = validated.start_fen
        width = validated.width
        height = validated.height
        pieces = validated.pieces
        king_roles = validated.king_roles
        pocket_roles = validated.pocket_roles
        capture_to_hand = validated.capture_to_hand
        promotion_type = validated.promotion_type
        promotion_roles = validated.promotion_roles
        promotion_order = validated.promotion_order
        show_promoted = validated.show_promoted
        rules_gate = validated.rules_gate
        rules_pass = validated.rules_pass
        legal_moves_need_history = validated.legal_moves_need_history
        n_fold_is_draw = validated.n_fold_is_draw
        show_check_counters = validated.show_check_counters
        fsf_variant_info = validated.fsf_variant_info
    else:
        try:
            fsf_variant_info = validate_fsf_variant_info(
                existing.get("fsfVariantInfo"), expected_name=new_name
            )
        except FsfVariantInfoError:
            # Old archived/locked documents are upgraded on their first edit.
            sf.load_variant_config(ini)
            fsf_variant_info = _resolved_variant_info(new_name)
            _ensure_resolved_catalogued_rules_supported(fsf_variant_info)
        derived = derive_catalogued_variant_info(fsf_variant_info)
        base_variant = str(existing.get("baseVariant") or derived.template)
        start_fen = derived.start_fen
        width = derived.width
        height = derived.height
        pieces = derived.pieces
        king_roles = derived.king_roles
        pocket_roles = derived.pocket_roles
        capture_to_hand = derived.capture_to_hand
        promotion_type = derived.promotion_type
        promotion_roles = derived.promotion_roles
        promotion_order = derived.promotion_order
        show_promoted = derived.show_promoted
        rules_gate = derived.rules_gate
        rules_pass = derived.rules_pass
        legal_moves_need_history = derived.legal_moves_need_history
        n_fold_is_draw = derived.n_fold_is_draw
        show_check_counters = derived.show_check_counters

    doc = _build_doc(
        name=new_name,
        base_variant=base_variant,
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
        promotion_type=promotion_type,
        promotion_roles=promotion_roles,
        promotion_order=promotion_order,
        show_promoted=show_promoted,
        rules_gate=rules_gate,
        rules_pass=rules_pass,
        legal_moves_need_history=legal_moves_need_history,
        n_fold_is_draw=n_fold_is_draw,
        show_check_counters=show_check_counters,
        fsf_variant_info=fsf_variant_info,
        created_at=existing.get("createdAt", datetime.now(timezone.utc)),
        visibility=visibility,
        piece_family_override=piece_family_override,
        archived=bool(existing.get("archived", False)),
        game_count=int(existing.get("gameCount") or 0),
    )

    if not fsf_rules_changed and new_name == old_name:
        _copy_piece_set_if_complete_for_doc(doc, existing)

    if not fsf_rules_changed and new_name == old_name and _has_board_svg(existing):
        doc["boardSvg"] = existing["boardSvg"]
        if "boardSvgUpdatedAt" in existing:
            doc["boardSvgUpdatedAt"] = existing["boardSvgUpdatedAt"]

    if not fsf_rules_changed and new_name == old_name:
        for field in (
            "aiFailureCount",
            "aiLastFailureAt",
            "aiLastFailureReason",
            "aiDisabledAt",
            "aiDisabledUntil",
            "aiDisabledReason",
        ):
            if field in existing:
                doc[field] = existing[field]

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
    count = await _game_count(app_state, new_name)
    return json_response(
        {"ok": True, "oldName": old_name, "variant": _client_doc(doc, game_count=count)}
    )


async def delete_catalogued_variant(request: web.Request) -> web.Response:
    app_state, _username, name, doc = await _load_owned_doc(request)
    if _is_fsf_builtin_catalogued_doc(doc):
        raise web.HTTPConflict(text="Fairy-Stockfish built-in catalogue entries cannot be deleted.")
    if _has_active_catalogued_games(app_state, name):
        raise web.HTTPConflict(
            text=(
                "This variant still has an active game. "
                "Finish or abort it before deleting the variant."
            )
        )
    if await _has_games(app_state, name):
        raise web.HTTPConflict(
            text="This variant already has saved public games. Archive it instead of deleting it."
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

    restored = register_catalogued_variant_doc(app_state, restored, load_config=True)
    restored_fields = catalogued_variant_derived_fields(restored["fsfVariantInfo"])
    restored_fields.update({"archived": False, "enabled": True, "updatedAt": now})
    await app_state.db[CATALOGUED_VARIANT_COLLECTION].update_one(
        {"_id": name},
        {"$set": restored_fields},
    )
    count = await _game_count(app_state, name)
    return json_response({"ok": True, "variant": _client_doc(restored, game_count=count)})


async def clone_catalogued_variant(request: web.Request) -> web.Response:
    app_state, username, name, doc = await _load_owned_doc(request)
    if app_state.db is None:
        raise web.HTTPServiceUnavailable(text="Database is unavailable.")
    if _is_fsf_builtin_catalogued_doc(doc):
        raise web.HTTPConflict(text="Fairy-Stockfish built-in catalogue entries cannot be cloned.")

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
    validated = validate_catalogued_ini(ini)
    new_name = validated.name

    now = datetime.now(timezone.utc)
    display_name = f"{doc.get('displayName') or name} v{new_name.rsplit('_v', 1)[-1]}"
    cloned = _build_doc(
        name=new_name,
        base_variant=validated.base_variant,
        display_name=display_name,
        description=str(doc.get("description") or ""),
        username=username,
        ini=ini,
        start_fen=validated.start_fen,
        width=validated.width,
        height=validated.height,
        pieces=validated.pieces,
        king_roles=validated.king_roles,
        pocket_roles=validated.pocket_roles,
        capture_to_hand=validated.capture_to_hand,
        promotion_type=validated.promotion_type,
        promotion_roles=validated.promotion_roles,
        promotion_order=validated.promotion_order,
        show_promoted=validated.show_promoted,
        rules_gate=validated.rules_gate,
        rules_pass=validated.rules_pass,
        legal_moves_need_history=validated.legal_moves_need_history,
        n_fold_is_draw=validated.n_fold_is_draw,
        show_check_counters=validated.show_check_counters,
        fsf_variant_info=validated.fsf_variant_info,
        created_at=now,
        piece_family_override=_catalogued_piece_family_override(doc),
    )

    try:
        await app_state.db[CATALOGUED_VARIANT_COLLECTION].insert_one(cloned)
    except DuplicateKeyError as exc:
        raise web.HTTPConflict(text="A catalogued variant with this name already exists.") from exc

    register_catalogued_variant_doc(app_state, cloned, load_config=False)
    return json_response({"ok": True, "variant": _client_doc(cloned, game_count=0)})
