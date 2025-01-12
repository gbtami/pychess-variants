from dataclasses import dataclass
from enum import Enum
from typing import Callable

from compress import (
    encode_move_duck,
    encode_move_flipping,
    encode_move_standard,
    decode_move_duck,
    decode_move_flipping,
    decode_move_standard,
)
from settings import PROD


@dataclass
class Variant:
    code: str
    uci_variant: str
    display_name: str
    icon: str
    chess960: bool = False
    bug: bool = False
    move_encoding: Callable = encode_move_standard
    move_decoding: Callable = decode_move_standard


class ServerVariants(Enum):
    def __init__(self, variant):
        self.code = variant.code
        self.uci_variant = variant.uci_variant
        self.display_name = variant.display_name
        self.icon = variant.icon

    CHESS = Variant("n", "chess", "CHESS", "M")
    CHESS960 = Variant("n", "chess", "CHESS960", "V", chess960=True)
    BUGHOUSE = Variant("F", "bughouse", "BUGHOUSE", "¢", bug=True)
    BUGHOUSE960 = Variant("F", "bughouse", "BUGHOUSE960", "⌀", chess960=True, bug=True)
    CRAZYHOUSE = Variant("h", "crazyhouse", "CRAZYHOUSE", "+")
    CRAZYHOUSE960 = Variant("h", "crazyhouse", "CRAZYHOUSE960", "%", chess960=True)
    ATOMIC = Variant("A", "atomic", "ATOMIC", "~")
    ATOMIC960 = Variant("A", "atomic", "ATOMIC960", "\\", chess960=True)
    KINGOFTHEHILL = Variant("B", "kingofthehill", "KING OF THE HILL", "🏴")
    KINGOFTHEHILL960 = Variant("B", "kingofthehill", "KING OF THE HILL960", "🏁", chess960=True)
    _3CHECK = Variant("X", "3check", "THREE-CHECK", "☰")
    _3CHECK960 = Variant("X", "3check", "THREE-CHECK960", "☷", chess960=True)
    ANTICHESS = Variant("’", "antichess", "ANTICHESS", "🐥")
    ANTICHESS960 = Variant("’", "antichess", "ANTICHESS960", "🐓", chess960=True)
    RACINGKINGS = Variant("°", "racingkings", "RACING KINGS", "🚗")
    RACINGKINGS960 = Variant("°", "racingkings", "RACING KINGS1440", "🚙", chess960=True)
    HORDE = Variant("š", "horde", "HORDE", "🐖")
    HORDE960 = Variant("š", "horde", "HORDE960", "🐷", chess960=True)
    PLACEMENT = Variant("p", "placement", "PLACEMENT", "S")
    DUCK = Variant("U", "duck", "DUCK CHESS", "🦆", move_encoding=encode_move_duck, move_decoding=decode_move_duck)  # fmt: skip
    ALICE = Variant("Y", "alice", "ALICE CHESS", "👧")
    FOGOFWAR = Variant("Q", "fogofwar", "FOG OF WAR", "🌫")

    MAKRUK = Variant("m", "makruk", "MAKRUK", "Q")
    MAKPONG = Variant("l", "makpong", "MAKPONG", "O")
    CAMBODIAN = Variant("b", "cambodian", "OUK CHAKTRANG", "!")
    SITTUYIN = Variant("y", "sittuyin", "SITTUYIN", ":")
    ASEAN = Variant("S", "asean", "ASEAN", "♻")

    SHOGI = Variant("g", "shogi", "SHOGI", "K")
    MINISHOGI = Variant("a", "minishogi", "MINISHOGI", "6")
    KYOTOSHOGI = Variant("k", "kyotoshogi", "KYOTO SHOGI", ")", move_encoding=encode_move_flipping, move_decoding=decode_move_flipping)  # fmt: skip
    DOBUTSU = Variant("D", "dobutsu", "DOBUTSU", "8")
    GOROGOROPLUS = Variant("G", "gorogoroplus", "GOROGORO+", "🐱")
    TORISHOGI = Variant("T", "torishogi", "TORI SHOGI", "🐦")
    CANNONSHOGI = Variant("W", "cannonshogi", "CANNON SHOGI", "💣")

    XIANGQI = Variant("x", "xiangqi", "XIANGQI", "|")
    MANCHU = Variant("M", "manchu", "MANCHU+", "{")
    JANGGI = Variant("j", "janggi", "JANGGI", "=")
    MINIXIANGQI = Variant("e", "minixiangqi", "MINIXIANGQI", "7")

    SHATRANJ = Variant("†", "shatranj", "SHATRANJ", "🐘")
    CAPABLANCA = Variant("c", "capablanca", "CAPABLANCA", "P")
    CAPABLANCA960 = Variant("c", "capablanca", "CAPABLANCA960", ",", chess960=True)
    CAPAHOUSE = Variant("i", "capahouse", "CAPAHOUSE", "&")
    CAPAHOUSE960 = Variant("i", "capahouse", "CAPAHOUSE960", "'", chess960=True)
    GOTHIC = Variant("o", "gothic", "GOTHIC", "P")
    GOTHHOUSE = Variant("t", "gothhouse", "GOTHHOUSE", "&")
    EMBASSY = Variant("E", "embassy", "EMBASSY", "P")
    DRAGON = Variant("R", "dragon", "DRAGON CHESS", "🐉")
    SEIRAWAN = Variant("s", "seirawan", "S-CHESS", "L")
    SEIRAWAN960 = Variant("s", "seirawan", "S-CHESS960", "}", chess960=True)
    SHOUSE = Variant("z", "shouse", "S-HOUSE", "$")
    GRAND = Variant("q", "grand", "GRAND", "(")
    GRANDHOUSE = Variant("r", "grandhouse", "GRANDHOUSE", "*")
    SHOGUN = Variant("u", "shogun", "SHOGUN", "-")
    SHAKO = Variant("d", "shako", "SHAKO", "9")
    HOPPELPOPPEL = Variant("w", "hoppelpoppel", "HOPPEL-POPPEL", "`")
    MANSINDAM = Variant("I", "mansindam", "MANSINDAM", "⛵")

    ORDA = Variant("f", "orda", "ORDA", "R")
    KHANS = Variant("L", "khans", "KHANS", "🐎")
    SYNOCHESS = Variant("v", "synochess", "SYNOCHESS", "_")
    SHINOBI = Variant("J", "shinobi", "SHINOBI", "🐢")
    SHINOBIPLUS = Variant("K", "shinobiplus", "SHINOBI+", "🐢")
    EMPIRE = Variant("P", "empire", "EMPIRE", "♚")
    ORDAMIRROR = Variant("O", "ordamirror", "ORDA MIRROR", "◩")
    CHAK = Variant("C", "chak", "CHAK", "🐬")
    CHENNIS = Variant("H", "chennis", "CHENNIS", "🎾", move_encoding=encode_move_flipping, move_decoding=decode_move_flipping)  # fmt: skip
    SPARTAN = Variant("N", "spartan", "SPARTAN", "⍺")

    ATAXX = Variant("Z", "ataxx", "ATAXX", "☣")

    @property
    def server_name(self):
        return self.value.uci_variant + ("960" if self.value.chess960 else "")


def get_server_variant(uci_variant, chess960):
    return VARIANTS[uci_variant + ("960" if chess960 else "")]


OLD_VARIANTS = (
    ServerVariants.EMBASSY,
    ServerVariants.GOTHIC,
    ServerVariants.GOTHHOUSE,
    ServerVariants.SHINOBI,
)

BUG_VARIANTS = (
    ServerVariants.BUGHOUSE,
    ServerVariants.BUGHOUSE960,
)

VARIANTS = {
    variant.server_name: variant for variant in ServerVariants if variant not in OLD_VARIANTS
}
VARIANT_ICONS = {
    variant.server_name: variant.value.icon
    for variant in ServerVariants
    if variant not in OLD_VARIANTS
}

# Remove new variants on prod site until they stabilize
if PROD:
    for variant in BUG_VARIANTS:
        del VARIANTS[variant.server_name]

C2V = {variant.code: variant.uci_variant for variant in ServerVariants}


if __name__ == "__main__":

    from const import VARIANT_ICONS_ORIG
    from compress import V2C_ORIG

    for sn, variant in VARIANTS.items():
        print(variant.code, variant.icon, sn)
        assert variant.code == V2C_ORIG[variant.uci_variant]
        assert variant.icon == VARIANT_ICONS_ORIG[variant.server_name]
