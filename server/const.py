from __future__ import annotations
from datetime import timedelta
from enum import global_enum, IntEnum, StrEnum
import re

from settings import static_url

POCKET_PATTERN = re.compile("\\[(.*)\\]")

# https://medium.com/quick-code/python-type-hinting-eliminating-importerror-due-to-circular-imports-265dfb0580f8
TYPE_CHECKING = False

DASH = "–"
ANON_PREFIX = "Anon" + DASH
TEST_PREFIX = "Test" + DASH

NONE_USER = "None" + DASH + "User"

SCHEDULE_MAX_DAYS = 7
TOURNAMENT_SPOTLIGHTS_MAX = 3

# Max notify documents TTL (time to live) weeks
NOTIFY_EXPIRE_WEEKS = timedelta(weeks=4)
NOTIFY_PAGE_SIZE = 7

# Max corr seek documents TTL (time to live) weeks
CORR_SEEK_EXPIRE_WEEKS = timedelta(weeks=2)

# Max number of lobby chat lines (deque limit)
MAX_CHAT_LINES = 100

BLOCK, FOLLOW = False, True
MAX_USER_BLOCK = 100

# Minimum number of rated games needed
HIGHSCORE_MIN_GAMES = 10

MAX_HIGHSCORE_ITEM_LIMIT = 50

# Show the number of spectators only after this limit
MAX_NAMED_SPECTATORS = 20


# tournament status
@global_enum
class TStatus(IntEnum):
    T_CREATED = 0
    T_STARTED = 1
    T_ABORTED = 2
    T_FINISHED = 3
    T_ARCHIVED = 4


# tournament frequency
@global_enum
class TFreq(StrEnum):
    HOURLY = "h"
    DAILY = "d"
    WEEKLY = "w"
    MONTHLY = "m"
    YEARLY = "y"
    MARATHON = "a"
    SHIELD = "s"


# tournament pairing
@global_enum
class TPairing(IntEnum):
    ARENA = 0
    RR = 1
    SWISS = 2


# translations
LANGUAGES = [
    "de",
    "en",
    "es",
    "gl_ES",
    "fr",
    "hu",
    "it",
    "ja",
    "ko",
    "nl",
    "pl",
    "pt",
    "ru",
    "th",
    "tr",
    "vi",
    "zh_CN",
    "zh_TW",
]


# fishnet work types
@global_enum
class WorkType(IntEnum):
    MOVE = 0
    ANALYSIS = 1


# game types
@global_enum
class GameType(IntEnum):
    CASUAL = 0
    RATED = 1
    IMPORTED = 2


# game status
@global_enum
class GameStatus(IntEnum):
    CREATED = -2
    STARTED = -1
    ABORTED = 0
    MATE = 1
    RESIGN = 2
    STALEMATE = 3
    TIMEOUT = 4
    DRAW = 5
    FLAG = 6
    ABANDON = 7
    CHEAT = 8
    BYEGAME = 9
    INVALIDMOVE = 10
    UNKNOWNFINISH = 11
    VARIANTEND = 12
    CLAIM = 13


LOSERS = {
    "abandon": GameStatus.ABANDON,
    "abort": GameStatus.ABORTED,
    "resign": GameStatus.RESIGN,
    "flag": GameStatus.FLAG,
}

CONSERVATIVE_CAPA_FEN = "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1"
LOOKING_GLASS_ALICE_FEN = "|r|n|b|q|k|b|n|r/|p|p|p|p|p|p|p|p/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1"
MANCHU_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1"
MANCHU_R_FEN = "m1bakab1r/9/9/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
DARK_FEN = "********/********/********/********/********/********/********/******** w - - 0 1"

VARIANT_960_TO_PGN = {
    "bughouse": "Bughouse960",
    "chess": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "seirawan": "Seirawan960",
    # to let lichess import work we produce variant names without "960" in PGNs
    "crazyhouse": "Crazyhouse",
    "atomic": "Atomic",
    "kingofthehill": "King of the Hill",
    "3check": "Three-check",
    "antichess": "Antichess",
    "racingkings": "Racingkings",
    "horde": "Horde",
    # some early game is accidentally saved as 960 in mongodb
    "shogi": "Shogi",
    "sittuyin": "Sittuyin",
    "makruk": "Makruk",
    "placement": "Placement",
    "grand": "Grand",
}

CATEGORIES = {
    "chess": (
        "chess",
        "chess960",
        "bughouse",
        "bughouse960",
        "crazyhouse",
        "crazyhouse960",
        "placement",
        "atomic",
        "atomic960",
        "kingofthehill",
        "kingofthehill960",
        "3check",
        "3check960",
        "antichess",
        "antichess960",
        "racingkings",
        "racingkings960",
        "horde",
        "horde960",
        "duck",
        "alice",
        "fogofwar",
    ),
    "fairy": (
        "shatranj",
        "capablanca",
        "capablanca960",
        "capahouse",
        "capahouse960",
        "dragon",
        "seirawan",
        "seirawan960",
        "shouse",
        "grand",
        "grandhouse",
        "shako",
        "shogun",
        "hoppelpoppel",
        "mansindam",
    ),
    "army": (
        "orda",
        "khans",
        "synochess",
        "empire",
        "ordamirror",
        "chak",
        "chennis",
        "shinobiplus",
        "spartan",
    ),
    "makruk": ("makruk", "makbug", "makpong", "cambodian", "sittuyin", "asean"),
    "shogi": (
        "shogi",
        "minishogi",
        "kyotoshogi",
        "dobutsu",
        "gorogoroplus",
        "torishogi",
        "cannonshogi",
    ),
    "xiangqi": ("xiangqi", "supply", "manchu", "janggi", "minixiangqi"),
    "other": ("ataxx"),
}

VARIANT_GROUPS = {}
for categ in CATEGORIES:
    for variant in CATEGORIES[categ]:
        VARIANT_GROUPS[variant] = categ

TROPHIES = {
    "top1": (static_url("images/trophy/Big-Gold-Cup.png"), "Champion!"),
    "top10": (static_url("images/trophy/Big-Silver-Cup.png"), "Top 10!"),
    "top50": (static_url("images/trophy/Fancy-Gold-Cup.png"), "Top 50!"),
    "top100": (static_url("images/trophy/Gold-Cup.png"), "Top 100!"),
    "shield": (static_url("images/trophy/shield-gold.png"), "Shield"),
    # some example custom trophy from lichess
    "acwc19": (static_url("images/trophy/acwc19.png"), "World Champion 2019"),
    "3wc21": (static_url("images/trophy/3wc21.png"), "World Champion 2021"),
}


#  Deferred translations!


def _(message):
    return message


TRANSLATED_PAIRING_SYSTEM_NAMES = {
    0: _("Arena"),
    1: _("Round-Robin"),
    2: _("Swiss"),
}

TRANSLATED_FREQUENCY_NAMES = {
    "h": _("Hourly"),
    "d": _("Daily"),
    "w": _("Weekly"),
    "m": _("Monthly"),
    "y": _("Yearly"),
    "a": _("Marathon"),
    "s": _("Shield"),
    "S": _("SEAturday"),
}

del _
