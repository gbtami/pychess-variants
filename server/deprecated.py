# Create mappings to compress variant, result and uci/usi move lists a little
# DEPRECATED (this is in ServerVariants enum from now on)
V2C_ORIG = {
    "ataxx": "Z",
    "chess": "n",
    "capablanca": "c",
    "capahouse": "i",
    "crazyhouse": "h",
    "bughouse": "F",
    "atomic": "A",
    "makruk": "m",
    "placement": "p",
    "dragon": "R",
    "seirawan": "s",
    "shogi": "g",
    "minishogi": "a",
    "shouse": "z",
    "sittuyin": "y",
    "xiangqi": "x",
    "grand": "q",
    "grandhouse": "r",
    "gothic": "o",
    "gothhouse": "t",
    "embassy": "E",
    "cambodian": "b",
    "shako": "d",
    "minixiangqi": "e",
    "kyotoshogi": "k",
    "shogun": "u",
    "janggi": "j",
    "makpong": "l",
    "orda": "f",
    "khans": "L",
    "synochess": "v",
    "hoppelpoppel": "w",
    "manchu": "M",
    "dobutsu": "D",
    "gorogoroplus": "G",
    "cannonshogi": "W",
    "shinobi": "J",
    "shinobiplus": "K",
    "empire": "P",
    "ordamirror": "O",
    "torishogi": "T",
    "asean": "S",
    "chak": "C",
    "chennis": "H",
    "mansindam": "I",
    "duck": "U",
    "spartan": "N",
    "kingofthehill": "B",
    "3check": "X",
    "alice": "Y",
    "fogofwar": "Q",
    "antichess": "’",
    "racingkings": "°",
    "horde": "š",
    "shatranj": "†",
}


# DEPRECATED (this is in ServerVariants enum from now on)
VARIANTS_ORIG = (
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

# DEPRECATED (this is in ServerVariants enum from now on)
VARIANT_ICONS_ORIG = {
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


# DEPRECATED (this is in ServerVariants enum from now on)
def variant_display_name_orig(variant):
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


def _(message):
    return message


TRANSLATED_VARIANT_NAMES_ORIG = {
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
    "racingkings960": _("Racing Kings 1440"),
    "horde": _("Horde"),
    "horde960": _("Horde960"),
    "shatranj": _("Shatranj"),
}
