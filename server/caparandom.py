import random


def caparandom_rank8():
    # https://www.chessvariants.com/contests/10/crc.html
    # we don't skip spositions that have unprotected pawns
    rank8 = [""] * 10
    positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    bright = [1, 3, 5, 7, 9]
    dark = [0, 2, 4, 6, 8]

    # 1. select queen or the archbishop to be placed first
    piece = random.choice("qa")

    # 2. place the selected 1st piece upon a bright square
    piece_pos = random.choice(bright)
    rank8[piece_pos] = piece
    positions.remove(piece_pos)
    bright.remove(piece_pos)

    # 3. place the selected 2nd piece upon a dark square
    piece_pos = random.choice(dark)
    rank8[piece_pos] = "q" if piece == "a" else "a"
    positions.remove(piece_pos)
    dark.remove(piece_pos)

    # 4. one bishop has to be placed upon a bright square
    piece_pos = random.choice(bright)
    rank8[piece_pos] = "b"
    positions.remove(piece_pos)

    # 5. one bishop has to be placed upon a dark square
    piece_pos = random.choice(dark)
    rank8[piece_pos] = "b"
    positions.remove(piece_pos)

    # 6. one chancellor has to be placed upon a free square
    piece_pos = random.choice(positions)
    rank8[piece_pos] = "c"
    positions.remove(piece_pos)

    # 7. one knight has to be placed upon a free square
    piece_pos = random.choice(positions)
    rank8[piece_pos] = "n"
    positions.remove(piece_pos)

    # 8. one knight has to be placed upon a free square
    piece_pos = random.choice(positions)
    rank8[piece_pos] = "n"
    positions.remove(piece_pos)

    # 9. set the king upon the center of three free squares left
    piece_pos = positions[1]
    rank8[piece_pos] = "k"

    # 10. set the rooks upon the both last free squares left
    piece_pos = positions[0]
    rank8[piece_pos] = "r"

    piece_pos = positions[2]
    rank8[piece_pos] = "r"

    return "".join(rank8)
