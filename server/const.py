from __future__ import annotations
from datetime import timedelta
import re

from settings import static_url, PROD

POCKET_PATTERN = re.compile("\\[(.*)\\]")

# https://medium.com/quick-code/python-type-hinting-eliminating-importerror-due-to-circular-imports-265dfb0580f8
TYPE_CHECKING = False

DASH = "–"
ANON_PREFIX = "Anon" + DASH

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
T_CREATED, T_STARTED, T_ABORTED, T_FINISHED, T_ARCHIVED = range(5)

# tournament frequency
HOURLY, DAILY, WEEKLY, MONTHLY, YEARLY, MARATHON, SHIELD = "h", "d", "w", "m", "y", "a", "s"

# tournament pairing
ARENA, RR, SWISS = range(3)

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
MOVE, ANALYSIS = 0, 1

# game types
CASUAL, RATED, IMPORTED = 0, 1, 2

# game status
(
    CREATED,
    STARTED,
    ABORTED,
    MATE,
    RESIGN,
    STALEMATE,
    TIMEOUT,
    DRAW,
    FLAG,
    ABANDON,
    CHEAT,
    BYEGAME,
    INVALIDMOVE,
    UNKNOWNFINISH,
    VARIANTEND,
    CLAIM,
) = range(-2, 14)

LOSERS = {
    "abandon": ABANDON,
    "abort": ABORTED,
    "resign": RESIGN,
    "flag": FLAG,
}

GRANDS = ("xiangqi", "manchu", "grand", "grandhouse", "shako", "janggi")

CONSERVATIVE_CAPA_FEN = "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1"
LOOKING_GLASS_ALICE_FEN = (
    "8/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1 | rnbqkbnr/pppppppp/8/8/8/8/8/8 w kq - 0 1"
)
MANCHU_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/M1BAKAB2 w - - 0 1"
MANCHU_R_FEN = "m1bakab1r/9/9/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"

VARIANTS = (
    "chess",
    "chess960",
    "bughouse",
    "bughouse960",
    "crazyhouse",
    "crazyhouse960",
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
    "placement",
    "duck",
    "alice",
    "fogofwar",
    "makruk",
    "makpong",
    "cambodian",
    "sittuyin",
    "asean",
    "shogi",
    "minishogi",
    "kyotoshogi",
    "dobutsu",
    # Gorogoro is superseded by Gorogoro Plus
    # "gorogoro",
    "gorogoroplus",
    "torishogi",
    "cannonshogi",
    "xiangqi",
    "manchu",
    "janggi",
    "minixiangqi",
    "shatranj",
    "capablanca",
    "capablanca960",
    "capahouse",
    "capahouse960",
    # We support to import/store/analyze these variants
    # but don't support to add them to leaderboard page
    # "gothic",
    # "gothhouse",
    # "embassy",
    "dragon",
    "seirawan",
    "seirawan960",
    "shouse",
    "grand",
    "grandhouse",
    "shogun",
    "shako",
    "hoppelpoppel",
    "mansindam",
    "orda",
    "khans",
    "synochess",
    # Shinobi is superseded by Shinobiplus Plus
    # "shinobi",
    "shinobiplus",
    "empire",
    "ordamirror",
    "chak",
    "chennis",
    "spartan",
    "ataxx",
)

# Remove new variants on prod site until they stabilize
if PROD:
    VARIANTS = tuple(e for e in VARIANTS if e not in ["bughouse", "bughouse960"])

VARIANT_ICONS = {
    "ataxx": "☣",
    "makruk": "Q",
    "makpong": "O",
    "sittuyin": ":",
    "shogi": "K",
    "janggi": "=",
    "xiangqi": "|",
    "chess": "M",
    "crazyhouse": "+",
    "placement": "S",
    "capablanca": "P",
    "capahouse": "&",
    "dragon": "🐉",
    "seirawan": "L",
    "seirawan960": "}",
    "shouse": "$",
    "grand": "(",
    "grandhouse": "*",
    "gothic": "P",
    "gothhouse": "&",
    "embassy": "P",
    "embassyhouse": "&",
    "minishogi": "6",
    "dobutsu": "8",
    "gorogoro": "🐱",
    "gorogoroplus": "🐱",
    "torishogi": "🐦",
    "cannonshogi": "💣",
    "cambodian": "!",
    "shako": "9",
    "minixiangqi": "7",
    "chess960": "V",
    "capablanca960": ",",
    "capahouse960": "'",
    "crazyhouse960": "%",
    "kyotoshogi": ")",
    "shogun": "-",
    "orda": "R",
    "khans": "🐎",
    "synochess": "_",
    "hoppelpoppel": "`",
    "manchu": "{",
    "atomic": "~",
    "atomic960": "\\",
    "shinobi": "🐢",
    "shinobiplus": "🐢",
    "empire": "♚",
    "ordamirror": "◩",
    "asean": "♻",
    "chak": "🐬",
    "chennis": "🎾",
    "mansindam": "⛵",
    "duck": "🦆",
    "spartan": "⍺",
    "kingofthehill": "🏴",
    "kingofthehill960": "🏁",
    "3check": "☰",
    "3check960": "☷",
    "bughouse": "¢",
    "bughouse960": "⌀",
    "alice": "👧",
    "fogofwar": "🌫",
    "antichess": "🐥",
    "antichess960": "🐓",
    "racingkings": "🚗",
    "racingkings960": "🚙",
    "horde": "🐖",
    "horde960": "🐷",
    "shatranj": "🐘",
}

VARIANT_960_TO_PGN = {
    "bughouse": "Bughouse960",
    "chess": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "crazyhouse": "Crazyhouse",  # to let lichess import work
    "atomic": "Atomic",  # to let lichess import work
    "kingofthehill": "King of the Hill",  # to let lichess import work
    "3check": "Three-check",  # to let lichess import work
    "seirawan": "Seirawan960",
    # some early game is accidentally saved as 960 in mongodb
    "shogi": "Shogi",
    "sittuyin": "Sittuyin",
    "makruk": "Makruk",
    "placement": "Placement",
    "grand": "Grand",
    "antichess": "Antichess",  # to let lichess import work
    "racingkings": "Racingkings",  # to let lichess import work
    "horde": "Horde",  # to let lichess import work
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
    "makruk": ("makruk", "makpong", "cambodian", "sittuyin", "asean"),
    "shogi": (
        "shogi",
        "minishogi",
        "kyotoshogi",
        "dobutsu",
        "gorogoroplus",
        "torishogi",
        "cannonshogi",
    ),
    "xiangqi": ("xiangqi", "manchu", "janggi", "minixiangqi"),
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


def variant_display_name(variant):
    if variant == "seirawan":
        return "S-CHESS"
    elif variant == "seirawan960":
        return "S-CHESS960"
    elif variant == "shouse":
        return "S-HOUSE"
    elif variant == "cambodian":
        return "OUK CHAKTRANG"
    elif variant == "ordamirror":
        return "ORDA MIRROR"
    elif variant == "gorogoroplus":
        return "GOROGORO+"
    elif variant == "kyotoshogi":
        return "KYOTO SHOGI"
    elif variant == "torishogi":
        return "TORI SHOGI"
    elif variant == "cannonshogi":
        return "CANNON SHOGI"
    elif variant == "duck":
        return "DUCK CHESS"
    elif variant == "kingofthehill":
        return "KING OF THE HILL"
    elif variant == "3check":
        return "THREE-CHECK"
    elif variant == "dragon":
        return "DRAGON CHESS"
    elif variant == "alice":
        return "ALICE CHESS"
    elif variant == "fogofwar":
        return "FOG OF WAR"
    else:
        return variant.upper()


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

TRANSLATED_VARIANT_NAMES = {
    "ataxx": _("Ataxx"),
    "chess": _("Chess"),
    "chess960": _("Chess960"),
    "crazyhouse": _("Crazyhouse"),
    "crazyhouse960": _("Crazyhouse960"),
    "placement": _("Placement"),
    "atomic": _("Atomic"),
    "atomic960": _("Atomic960"),
    "duck": _("Duck Chess"),
    "alice": _("Alice Chess"),
    "fogofwar": _("Fog of War"),
    "makruk": _("Makruk"),
    "makpong": _("Makpong"),
    "cambodian": _("Ouk Chaktrang"),
    "sittuyin": _("Sittuyin"),
    "asean": _("ASEAN"),
    "shogi": _("Shogi"),
    "minishogi": _("Minishogi"),
    "kyotoshogi": _("Kyoto Shogi"),
    "dobutsu": _("Dobutsu"),
    "bughouse": _("Bughouse"),
    "bughouse960": _("Bughouse960"),
    # Gorogoro is superseded by Gorogoro Plus
    "gorogoro": _("Gorogoro"),
    "gorogoroplus": _("Gorogoro+"),
    "torishogi": _("Tori Shogi"),
    "cannonshogi": _("Cannon Shogi"),
    "xiangqi": _("Xiangqi"),
    "manchu": _("Manchu+"),
    "janggi": _("Janggi"),
    "minixiangqi": _("Minixiangqi"),
    "capablanca": _("Capablanca"),
    "capablanca960": _("Capablanca960"),
    "capahouse": _("Capahouse"),
    "capahouse960": _("Capahouse960"),
    # We support to import/store/analyze these variants
    # but don't support to add them to leaderboard page
    "gothic": _("Gothic"),
    "gothhouse": _("Gothhouse"),
    "embassy": _("Embassy"),
    "dragon": _("Dragon Chess"),
    "seirawan": _("S-Chess"),
    "seirawan960": _("S-Chess960"),
    "shouse": _("S-House"),
    "grand": _("Grand"),
    "grandhouse": _("Grandhouse"),
    "shogun": _("Shogun"),
    "shako": _("Shako"),
    "hoppelpoppel": _("Hoppel-Poppel"),
    "orda": _("Orda Chess"),
    "khans": _("Khan's Chess"),
    "synochess": _("Synochess"),
    "shinobi": _("Shinobi"),
    "shinobiplus": _("Shinobi+"),
    "empire": _("Empire"),
    "ordamirror": _("Orda Mirror"),
    "chak": _("Chak"),
    "chennis": _("Chennis"),
    "spartan": _("Spartan"),
    "kingofthehill": _("King of the Hill"),
    "kingofthehill960": _("King of the Hill 960"),
    "3check": _("Three check"),
    "3check960": _("Three check 960"),
    "mansindam": _("Mansindam"),
    "antichess": _("Antichess"),
    "antichess960": _("Antichess960"),
    "racingkings": _("Racing Kings"),
    "racingkings960": _("Racing Kings 960"),
    "horde": _("Horde"),
    "horde960": _("Horde960"),
    "shatranj": _("Shatranj"),
}

del _
