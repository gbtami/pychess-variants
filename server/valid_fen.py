from const import MANCHU_FEN, MANCHU_R_FEN
from fairy import STANDARD_FEN


VALID_FEN = {
    "alice": (
        "|r|n|b|q|k|b|n|r/|p|p|p|p|p|p|p|p/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",  # Lookig glass
    ),
    "fogofwar": {
        STANDARD_FEN,
    },
    "capablanca": (
        "rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR w KQkq - 0 1",  # Bird
        "ranbqkbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR w KQkq - 0 1",  # Carrera
        "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC w KQkq - 0 1",  # Conservative
        "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR w KQkq - 0 1",  # Embassy
        "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR w KQkq - 0 1",  # Gothic
        "rbqnkcnabr/pppppppppp/10/10/10/10/PPPPPPPPPP/RBQNKCNABR w KQkq - 0 1",  # Grotesque
        "rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR w KQkq - 0 1",  # Schoolbook
        "rbncqkanbr/pppppppppp/10/10/10/10/PPPPPPPPPP/RBNCQKANBR w KQkq - 0 1",  # Univers
        "crnbakbnrq/pppppppppp/10/10/10/10/PPPPPPPPPP/CRNBAKBNRQ w KQkq - 0 1",  # Victorian
    ),
    "capahouse": (
        "rnbcqkabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBCQKABNR[] w KQkq - 0 1",  # Bird
        "ranbqkbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR[] w KQkq - 0 1",  # Carrera
        "arnbqkbnrc/pppppppppp/10/10/10/10/PPPPPPPPPP/ARNBQKBNRC[] w KQkq - 0 1",  # Conservative
        "rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1",  # Embassy
        "rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1",  # Gothic
        "rbqnkcnabr/pppppppppp/10/10/10/10/PPPPPPPPPP/RBQNKCNABR[] w KQkq - 0 1",  # Grotesque
        "rqnbakbncr/pppppppppp/10/10/10/10/PPPPPPPPPP/RQNBAKBNCR[] w KQkq - 0 1",  # Schoolbook
        "rbncqkanbr/pppppppppp/10/10/10/10/PPPPPPPPPP/RBNCQKANBR[] w KQkq - 0 1",  # Univers
        "crnbakbnrq/pppppppppp/10/10/10/10/PPPPPPPPPP/CRNBAKBNRQ[] w KQkq - 0 1",  # Victorian
    ),
    "manchu": (
        MANCHU_FEN,
        MANCHU_R_FEN,
    ),
}
