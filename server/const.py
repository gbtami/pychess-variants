# translations
LANGUAGES = ["en", "fr", "hu", "pt", "th", "zh"]

# fishnet work types
MOVE, ANALYSIS = 0, 1

# game status
CREATED, STARTED, ABORTED, MATE, RESIGN, STALEMATE, TIMEOUT, DRAW, FLAG, \
    ABANDONE, CHEAT, NOSTART, INVALIDMOVE, UNKNOWNFINISH, VARIANTEND = range(-2, 13)

LOSERS = {
    "abandone": ABANDONE,
    "abort": ABORTED,
    "resign": RESIGN,
    "flag": FLAG,
}

VARIANTS = (
    "crazyhouse",
    "crazyhouse960",
    "chess",
    "chess960",
    "placement",
    "shogi",
    "janggi",
    "xiangqi",
    "makruk",
    "makpong",
    "cambodian",
    "sittuyin",
    "seirawan",
    "shouse",
    "capablanca",
    "capablanca960",
    "capahouse",
    "capahouse960",
    "gothic",
    # "gothhouse",
    "grand",
    "grandhouse",
    "shako",
    "minishogi",
    "kyotoshogi",
    "minixiangqi",
    "shogun",
    "orda",
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
