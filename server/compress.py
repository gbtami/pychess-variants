from __future__ import annotations
from itertools import product
from string import ascii_uppercase

MAX_COMPRESSED_BOARD_WIDTH = 16
MAX_COMPRESSED_BOARD_HEIGHT = 16

"""
We use the simplest compression method for moves here: 2 byte square to 1 byte ascii.
For better result consider compressing moves using indexes in valid move lists.
For more sophisticated encoding consider using lichess method described at:
https://lichess.org/blog/Wqa7GiAAAOIpBLoY/developer-update-275-improved-game-compression
"""

R2C = {"1-0": "a", "0-1": "b", "1/2-1/2": "c", "*": "d"}
C2R = {v: k for k, v in R2C.items()}

# Create square to int mapping
M2C = dict(zip([a + b for a, b in product("abcdefghij", "0123456789")], list(range(34, 256))))

# Add possible from parts of drop moves
PIECES = "PNBRQKFGSLACHE"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# Kyoto Shogi drop moves can start with extra "+"
for piece in "PLNS":
    M2C["+%s" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (shinobi) was added after kyotoshogi
#   so these letters need to be here to be backward compatible
PIECES = "MDJ"
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# Chennis drop moves can start with extra "+" as well (P and S are already added above for Kyoto Shogi)
for piece in "FM":
    M2C["+%s" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (cannonshogi) was added after chennis
#   so these letters need to be here to be backward compatible
PIECES = "UI"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (melonvariant) was added after cannonshogi
#   so these letters need to be here to be backward compatible
PIECES = "W"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# The remaining droppable piece letters
m2c_len = len(M2C) + 34
for letter in ascii_uppercase:
    if "%s@" % letter not in M2C:
        M2C["%s@" % letter] = m2c_len
        m2c_len += 1

# Keep the historical a0-j9 and drop encodings stable, then append extra
# board files for wider user-defined variants. 10-rank boards are normalized
# through grand2zero(), so ranks 0..9 are enough for all <=10-rank variants.
# With all uppercase drop letters this leaves room for files k..p.
for file_ in "klmnop":
    for rank in "0123456789":
        M2C[f"{file_}{rank}"] = m2c_len
        m2c_len += 1

# User-defined variants with dropPromoted can use promoted drop origins for any role.
for piece in ascii_uppercase:
    key = "+%s" % piece
    if key not in M2C:
        M2C[key] = m2c_len
        m2c_len += 1

# for x in M2C:
#    print(x, M2C[x])

C2M = {v: k for k, v in M2C.items()}

# Extended codecs are intentionally separate from the historical standard codec.
# Only catalogued variants with 11..16 ranks use these slower variable-rank
# parsers. Built-in variants and catalogued variants up to 10 ranks keep the
# old fixed-slice encode/decode functions above and, when needed, the existing
# grand2zero()/zero2grand() normalization.
EXTENDED_FILES = "abcdefghijklmnop"
EXTENDED_RANKS = tuple(str(rank) for rank in range(1, MAX_COMPRESSED_BOARD_HEIGHT + 1))
EXTENDED_M2C = dict(
    zip(
        [file_ + rank for file_, rank in product(EXTENDED_FILES, EXTENDED_RANKS)],
        range(34, 34 + len(EXTENDED_FILES) * len(EXTENDED_RANKS)),
    )
)
ext_m2c_len = max(EXTENDED_M2C.values()) + 1
for letter in ascii_uppercase:
    EXTENDED_M2C[f"{letter}@"] = ext_m2c_len
    ext_m2c_len += 1
for letter in ascii_uppercase:
    EXTENDED_M2C[f"+{letter}"] = ext_m2c_len
    ext_m2c_len += 1
EXTENDED_C2M = {v: k for k, v in EXTENDED_M2C.items()}


def _parse_extended_square(move: str, index: int) -> tuple[str, int]:
    if index >= len(move):
        raise KeyError(move[index:])

    file_ = move[index]
    if file_ not in EXTENDED_FILES:
        raise KeyError(file_)

    rank_start = index + 1
    rank_end = rank_start
    while rank_end < len(move) and move[rank_end].isdigit():
        rank_end += 1

    if rank_end == rank_start:
        raise KeyError(move[index:rank_end])

    square = move[index:rank_end]
    if square not in EXTENDED_M2C:
        raise KeyError(square)

    return square, rank_end


def _parse_extended_move(move: str) -> tuple[str, str, str]:
    if len(move) >= 3 and move[1] == "@":
        from_part = move[:2]
        to_part, end = _parse_extended_square(move, 2)
        return from_part, to_part, move[end:]

    if len(move) >= 4 and move[0] == "+" and move[2] == "@":
        from_part = move[:2]
        to_part, end = _parse_extended_square(move, 3)
        return from_part, to_part, move[end:]

    from_part, index = _parse_extended_square(move, 0)
    to_part, index = _parse_extended_square(move, index)
    promotion = move[index:]
    return from_part, to_part, promotion


def encode_move_flipping(move):
    return (
        chr(M2C[move[0:2]]) + chr(M2C[move[3:5]]) + "@"
        if move[0] == "+"
        else chr(M2C[move[0:2]]) + chr(M2C[move[2:4]]) + (move[4] if len(move) == 5 else "")
    )


def encode_move_duck(move):
    return (
        chr(M2C[move[0:2]])  # first leg 'from'
        + chr(M2C[move[2:4]])  # first leg 'to'
        + chr(M2C[move[-2:]])  # duck 'to'
        + (move[4] if len(move) == 10 else "")  # promotion
    )


def encode_move_standard(move):
    if len(move) >= 4 and move[0] == "+" and move[2] == "@":
        return chr(M2C[move[0:2]]) + chr(M2C[move[3:5]]) + move[5:]
    return chr(M2C[move[0:2]]) + chr(M2C[move[2:4]]) + move[4:]


def encode_move_extended(move):
    from_part, to_part, promotion = _parse_extended_move(move)
    return chr(EXTENDED_M2C[from_part]) + chr(EXTENDED_M2C[to_part]) + promotion


def decode_move_flipping(move):
    return (
        C2M[ord(move[0])] + "@" + C2M[ord(move[1])]
        if move[-1] == "@"
        else C2M[ord(move[0])] + C2M[ord(move[1])] + (move[2] if len(move) == 3 else "")
    )


def decode_move_duck(move):
    return (
        C2M[ord(move[0])]
        + C2M[ord(move[1])]
        + (move[3] if len(move) == 4 else "")
        + ","
        + C2M[ord(move[1])]
        + C2M[ord(move[2])]
    )


def decode_move_standard(move):
    from_part = C2M[ord(move[0])]
    to_part = C2M[ord(move[1])]
    suffix = move[2:]
    if from_part.startswith("+"):
        return from_part + "@" + to_part + suffix
    return from_part + to_part + suffix


def decode_move_extended(move):
    from_part = EXTENDED_C2M[ord(move[0])]
    to_part = EXTENDED_C2M[ord(move[1])]
    suffix = move[2:]
    if from_part.startswith("+"):
        return from_part + "@" + to_part + suffix
    return from_part + to_part + suffix
