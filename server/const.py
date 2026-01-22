from __future__ import annotations
from datetime import timedelta
from enum import global_enum, IntEnum, StrEnum
import re

from settings import static_url
from variants import VARIANTS, get_server_variant

POCKET_PATTERN = re.compile("\\[(.*)\\]")

DASH = "–"
ANON_PREFIX = "Anon" + DASH
TEST_PREFIX = "Test" + DASH

NONE_USER = "None" + DASH + "User"

RESERVED_USERS = (
    "Random-Mover",
    "Fairy-Stockfish",
    "Discord-Relay",
    "Invite-friend",
    "PyChess",
    NONE_USER,
)


def reserved(username):
    return username.upper() in map(str.upper, RESERVED_USERS)


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

# Periodically check for sse_request is_connected()
SSE_GET_TIMEOUT = 10


# tournament status
@global_enum
class TStatus(IntEnum):
    T_CREATED = 0
    T_STARTED = 1
    T_ABORTED = 2
    T_FINISHED = 3
    T_ARCHIVED = 4


T_CREATED = TStatus.T_CREATED
T_STARTED = TStatus.T_STARTED
T_ABORTED = TStatus.T_ABORTED
T_FINISHED = TStatus.T_FINISHED
T_ARCHIVED = TStatus.T_ARCHIVED


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


HOURLY = TFreq.HOURLY
DAILY = TFreq.DAILY
WEEKLY = TFreq.WEEKLY
MONTHLY = TFreq.MONTHLY
YEARLY = TFreq.YEARLY
MARATHON = TFreq.MARATHON
SHIELD = TFreq.SHIELD


# tournament pairing
@global_enum
class TPairing(IntEnum):
    ARENA = 0
    RR = 1
    SWISS = 2
    SIMUL = 3


ARENA = TPairing.ARENA
RR = TPairing.RR
SWISS = TPairing.SWISS
SIMUL = TPairing.SIMUL


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


MOVE = WorkType.MOVE
ANALYSIS = WorkType.ANALYSIS


# game types
@global_enum
class GameType(IntEnum):
    CASUAL = 0
    RATED = 1
    IMPORTED = 2


CASUAL = GameType.CASUAL
RATED = GameType.RATED
IMPORTED = GameType.IMPORTED


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

CREATED = GameStatus.CREATED
STARTED = GameStatus.STARTED
ABORTED = GameStatus.ABORTED
MATE = GameStatus.MATE
RESIGN = GameStatus.RESIGN
STALEMATE = GameStatus.STALEMATE
TIMEOUT = GameStatus.TIMEOUT
DRAW = GameStatus.DRAW
FLAG = GameStatus.FLAG
ABANDON = GameStatus.ABANDON
CHEAT = GameStatus.CHEAT
BYEGAME = GameStatus.BYEGAME
INVALIDMOVE = GameStatus.INVALIDMOVE
UNKNOWNFINISH = GameStatus.UNKNOWNFINISH
VARIANTEND = GameStatus.VARIANTEND
CLAIM = GameStatus.CLAIM


LOSERS = {
    "abandon": GameStatus.ABANDON,
    "abort": GameStatus.ABORTED,
    "resign": GameStatus.RESIGN,
    "flag": GameStatus.FLAG,
}

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
        "xiangfu",
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
    "xiangqi": ("xiangqi", "supply", "manchu", "janggi", "minixiangqi", "jieqi"),
    "other": ("ataxx"),
}

VARIANT_GROUPS = {}
for categ in CATEGORIES:
    for variant in CATEGORIES[categ]:
        VARIANT_GROUPS[variant] = categ

GAME_CATEGORY_ALL = "all"
GAME_CATEGORIES = (GAME_CATEGORY_ALL, *CATEGORIES.keys())

CATEGORY_VARIANTS = {
    GAME_CATEGORY_ALL: VARIANTS,
}
CATEGORY_VARIANT_GROUPS = {
    GAME_CATEGORY_ALL: VARIANT_GROUPS,
}
CATEGORY_VARIANT_LISTS = {
    GAME_CATEGORY_ALL: tuple(VARIANTS.keys()),
}
CATEGORY_VARIANT_SETS = {
    GAME_CATEGORY_ALL: frozenset(VARIANTS.keys()),
}
CATEGORY_VARIANT_CODES = {
    GAME_CATEGORY_ALL: frozenset(variant.code for variant in VARIANTS.values()),
}

for category in CATEGORIES:
    variants = {v: VARIANTS[v] for v in CATEGORIES[category] if v in VARIANTS}
    CATEGORY_VARIANTS[category] = variants
    CATEGORY_VARIANT_GROUPS[category] = {v: category for v in variants}
    CATEGORY_VARIANT_LISTS[category] = tuple(variants.keys())
    CATEGORY_VARIANT_SETS[category] = frozenset(variants.keys())
    codes = set()
    for variant in variants:
        variant960 = variant.endswith("960")
        uci_variant = variant[:-3] if variant960 else variant
        try:
            server_variant = get_server_variant(uci_variant, variant960)
        except KeyError:
            continue
        codes.add(server_variant.code)
    CATEGORY_VARIANT_CODES[category] = frozenset(codes)


def normalize_game_category(game_category: str) -> str:
    return game_category if game_category in CATEGORY_VARIANTS else GAME_CATEGORY_ALL


def normalize_item_categories(category):
    if category is None:
        return (GAME_CATEGORY_ALL,)
    if isinstance(category, str):
        return (category,)
    if isinstance(category, (list, tuple, set)):
        return tuple(category)
    return (category,)


def category_matches(user_category: str, item_category) -> bool:
    if user_category == GAME_CATEGORY_ALL:
        return True
    categories = normalize_item_categories(item_category)
    return GAME_CATEGORY_ALL in categories or user_category in categories


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
    3: _("Simul"),
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
