from fairy import STANDARD_FEN, LOOKING_GLASS_ALICE_FEN, MANCHU_FEN, MANCHU_R_FEN, JIEQI_FEN
from fairy.capa_altarnate import (
    BIRD,
    CARRERA,
    CONSERVATIVE,
    EMBASSY,
    GOTHIC,
    SCHOOLBOOK,
    UNIVERS,
    VICTORIAN,
)


def house(fen):
    return fen.replace(" w", "[] w")


VALID_FEN = {
    "alice": (LOOKING_GLASS_ALICE_FEN,),
    "fogofwar": (STANDARD_FEN,),
    "capablanca": (
        BIRD,
        CARRERA,
        CONSERVATIVE,
        EMBASSY,
        GOTHIC,
        SCHOOLBOOK,
        UNIVERS,
        VICTORIAN,
    ),
    "capahouse": (
        house(BIRD),
        house(CARRERA),
        house(CONSERVATIVE),
        house(EMBASSY),
        house(GOTHIC),
        house(SCHOOLBOOK),
        house(UNIVERS),
        house(VICTORIAN),
    ),
    "manchu": (
        MANCHU_FEN,
        MANCHU_R_FEN,
    ),
    "jieqi": (JIEQI_FEN,),
}
