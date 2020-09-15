# translations
LANGUAGES = ["de", "en", "es", "fr", "hu", "it", "ja", "ko", "pt", "th", "zh"]

# fishnet work types
MOVE, ANALYSIS = 0, 1

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
    "makruk",
    "makpong",
    "cambodian",
    "sittuyin",
    "shogi",
    "minishogi",
    "kyotoshogi",
    "dobutsu",
    "xiangqi",
    "manchu",
    "janggi",
    "minixiangqi",
    "capablanca",
    "capablanca960",
    "capahouse",
    "capahouse960",
    # "gothic",
    # "gothhouse",
    "seirawan",
    "shouse",
    "grand",
    "grandhouse",
    "shako",
    "shogun",
    "orda",
    "synochess",
    "hoppelpoppel",
)

VARIANT_ICONS = {
    "makruk": "Q",
    "makpong": "O",
    "sittuyin": ":",
    "shogi": "K",
    "janggi": "=",
    "xiangqi": "8",
    "chess": "M",
    "crazyhouse": "+",
    "placement": "S",
    "capablanca": "P",
    "capahouse": "&",
    "seirawan": "L",
    "shouse": "$",
    "grand": "(",
    "grandhouse": "*",
    "gothic": "P",
    "gothhouse": "&",
    "minishogi": "6",
    "dobutsu": "6",
    "cambodian": "!",
    "shako": "9",
    "minixiangqi": "7",
    "chess960": "V",
    "capablanca960": ",",
    "capahouse960": "'",
    "crazyhouse960": "%",
    "kyotoshogi": ")",
    "chess": "M",
    "shogun": "-",
    "orda": "R",
    "synochess": "_",
    "hoppelpoppel": "`",
    "manchu": "8",
}

VARIANT_960_TO_PGN = {
    "chess": "Chess960",
    "capablanca": "Caparandom",
    "capahouse": "Capahouse960",
    "crazyhouse": "Crazyhouse",  # to let lichess import work
    "seirawan": "Seirawan960",
    # some early game is accidentally saved as 960 in mongodb
    "shogi": "Shogi",
    "sittuyin": "Sittuyin",
    "makruk": "Makruk",
    "placement": "Placement",
    "grand": "Grand",
}
