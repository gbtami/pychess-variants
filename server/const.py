from settings import static_url

# Max number of lobby chat lines (deque limit)
MAX_CHAT_LINES = 100

# Minimum number of rated games needed
HIGHSCORE_MIN_GAMES = 10

# Show the number of spectators only after this limit
MAX_NAMED_SPECTATORS = 20

# tournament status
T_CREATED, T_STARTED, T_ABORTED, T_FINISHED, T_ARCHIVED = range(5)

# tournament frequency
DAILY, WEEKLY, MONTHLY, YEARLY, MARATHON, SHIELD = "d", "w", "m", "y", "a", "s"

# tournament pairing
ARENA, RR, SWISS = range(3)

# translations
LANGUAGES = ["de", "en", "es", "gl_ES", "fr", "hu", "it", "ja", "ko", "nl", "pl", "pt", "ru", "th", "tr", "zh"]

# fishnet work types
MOVE, ANALYSIS = 0, 1

# game types
CASUAL, RATED, IMPORTED = 0, 1, 2

# game status
CREATED, STARTED, ABORTED, MATE, RESIGN, STALEMATE, TIMEOUT, DRAW, FLAG, \
    ABANDONE, CHEAT, BYEGAME, INVALIDMOVE, UNKNOWNFINISH, VARIANTEND, CLAIM = range(-2, 14)

LOSERS = {
    "abandone": ABANDONE,
    "abort": ABORTED,
    "resign": RESIGN,
    "flag": FLAG,
}

GRANDS = ("xiangqi", "manchu", "grand", "grandhouse", "shako", "janggi")

CONSERVATIVE_CAPA_FEN = "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1"

VARIANTS = (
    "antichess",
    "antichess960",
    "losers",
    "losers960",
    "anti_antichess",
    "anti_antichess960",
    "antiatomic",
    "antiatomic960",
    "antihouse",
    "antihouse960",
    "coffeehouse",
    "coffeehouse960",
    "coffeehill",
    "coffeehill960",
    "atomic_giveaway_hill",
    "atomic_giveaway_hill960"  
    # We support to import/store/analyze these variants
    # but don't support to add them to leaderboard page
    # "gothic",
    # "gothhouse",
    # "embassy",
#    "orda",
#    "ordamirror",
    # "chak"
)

VARIANT_ICONS = {
    "makruk": "Q",
    "makpong": "O",
    "sittuyin": ":",
    "shogi": "K",
    "janggi": "=",
    "xiangqi": "|",
    "chess": "M",
    "crazyhouse": "+",
    "placement": "S",
    "kingofthehill": "🏳️",
    "racingkings": "♔",
    "antichess": "♔",
    "antichess960": "♔",
    "losers": "♔",
    "losers960": "♔",
    "anti_antichess": "♔",
    "anti_antichess960": "♔",
    "antiatomic": "♔",
    "antiatomic960": "♔",
    "antihouse": "♔",
    "antihouse960": "♔",
    "coffeehouse": "♔",
    "coffeehouse960": "♔",
    "coffeehill": "♔",
    "coffeehill960": "♔",
    "atomic_giveaway_hill": "♔",
    "atomic_giveaway_hill960": "♔",       
    "capablanca": "P",
    "capahouse": "&",
    "seirawan": "L",
    "seirawan960": "}",
    "shouse": "$",
    "grand": "(",
    "grandhouse": "*",
    "gothic": "P",
    "gothhouse": "&",
    "embassy": "P",
    "minishogi": "6",
    "dobutsu": "8",
    "gorogoro": "🐱",
    "torishogi": "🐦",
    "cambodian": "!",
    "shako": "9",
    "minixiangqi": "7",
    "chess960": "V",
    "capablanca960": ",",
    "capahouse960": "'",
    "crazyhouse960": "%",
    "kyotoshogi": ")",
    "shogun": "-",
#    "orda": "R",
    "synochess": "_",
    "hoppelpoppel": "`",
    "manchu": "{",
    "atomic": "~",
    "atomic960": "\\",
    "shinobi": "🐢",
    "empire": "♚",
#    "ordamirror": "◩",
    "asean": "♻",
    "chak": "🐬",
}

VARIANT_960_TO_PGN = {
    "chess": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "crazyhouse": "Crazyhouse",  # to let lichess import work
    "atomic": "Atomic",          # to let lichess import work
    "antichess": "Antichess",          # to let lichess import work    
    "losers": "Losers960",
    "anti_antichess": "Anti_antichess960",
    "antiatomic": "Antiatomic960",
    "antihouse": "Antihouse960",
    "coffeehouse": "Coffeehouse960",
    "coffeehill": "Coffeehill960",
    "atomic_giveaway_hill": "Atomic_giveaway_hill960",            
    "seirawan": "Seirawan960",
    # some early game is accidentally saved as 960 in mongodb
    "shogi": "Shogi",
    "sittuyin": "Sittuyin",
    "makruk": "Makruk",
    "placement": "Placement",
    "grand": "Grand",
}

CATEGORIES = {
    "chess": ("chess", "chess960", "crazyhouse", "crazyhouse960", "placement", "atomic", "atomic960", "antichess", "antichess960", "antiatomic", "antiatomic", "coffeehouse", "coffeehouse960"),
    "fairy": ("capablanca", "capablanca960", "capahouse", "capahouse960", "seirawan", "seirawan960", "shouse", "grand", "grandhouse", "shako", "shogun", "hoppelpoppel"),
    "army": ("synochess", "shinobi", "empire", "chak"),
    "makruk": ("makruk", "makpong", "cambodian", "sittuyin", "asean"),
    "shogi": ("shogi", "minishogi", "kyotoshogi", "dobutsu", "gorogoro", "torishogi"),
    "xiangqi": ("xiangqi", "manchu", "janggi", "minixiangqi"),
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
    "acwc21": (static_url("images/trophy/acwc21.png"), "World Champion 2021"),
    "developer": (static_url("images/trophy/developer.png"), "Liantichess Developer"),
    "moderator": (static_url("images/trophy/moderator.png"), "Liantichess Moderator")    
}


def variant_display_name(variant):
    if variant == "seirawan":
        return "S-CHESS"
    elif variant == "seirawan960":
        return "S-CHESS960"
    elif variant == "shouse":
        return "S-HOUSE"
    elif variant == "cambodian":
        return "OUK CHATRANG"
#    elif variant == "ordamirror":
 #       return "ORDA MIRROR"
    elif variant == "kyotoshogi":
        return "KYOTO SHOGI"
    elif variant == "torishogi":
        return "TORI SHOGI"
    else:
        return variant.upper()


def pairing_system_name(system):
    if system == 0:
        return "Arena"
    elif system == 1:
        return "Round-Robin"
    elif system == 2:
        return "Swiss"
    else:
        return ""
