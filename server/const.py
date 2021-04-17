# translations
LANGUAGES = ["de", "en", "es", "fr", "hu", "it", "ja", "ko", "pt", "th", "tr", "zh"]

# fishnet work types
MOVE, ANALYSIS = 0, 1

# game types
CASUAL, RATED, IMPORTED = 0, 1, 2

# game status
CREATED, STARTED, ABORTED, MATE, RESIGN, STALEMATE, TIMEOUT, DRAW, FLAG, \
    ABANDONE, CHEAT, NOSTART, INVALIDMOVE, UNKNOWNFINISH, VARIANTEND, CLAIM = range(-2, 14)

LOSERS = {
    "abandone": ABANDONE,
    "abort": ABORTED,
    "resign": RESIGN,
    "flag": FLAG,
}

GRANDS = ("xiangqi", "manchu", "grand", "grandhouse", "shako", "janggi")

VARIANTS = (
    "chess",
    "chess960",
    "crazyhouse",
    "crazyhouse960",
    "placement",
    "atomic",
    "atomic960",
    "makruk",
    "makpong",
    "cambodian",
    "sittuyin",
    "shogi",
    "minishogi",
    "kyotoshogi",
    "dobutsu",
    "gorogoro",
    "xiangqi",
    "manchu",
    "janggi",
    "minixiangqi",
    "capablanca",
    "capablanca960",
    "capahouse",
    "capahouse960",
    # We support to import/store/analyze these variants
    # but don't support to add them to leaderboard page
    # "gothic",
    # "gothhouse",
    # "embassy",
    "seirawan",
    "seirawan960",
    "shouse",
    "grand",
    "grandhouse",
    "shako",
    "shogun",
    "orda",
    "synochess",
    "hoppelpoppel",
    "shinobi",
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
    "synochess": "_",
    "hoppelpoppel": "`",
    "manchu": "{",
    "atomic": "~",
    "atomic960": "\\",
    "shinobi": "🐢",  # TODO change to correct icon
}

VARIANT_960_TO_PGN = {
    "chess": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "crazyhouse": "Crazyhouse",  # to let lichess import work
    "atomic": "Atomic",          # to let lichess import work
    "seirawan": "Seirawan960",
    # some early game is accidentally saved as 960 in mongodb
    "shogi": "Shogi",
    "sittuyin": "Sittuyin",
    "makruk": "Makruk",
    "placement": "Placement",
    "grand": "Grand",
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
    else:
        return variant.upper()
