from functools import lru_cache


# Covered Jieqi piece squares ordered as they appear in xiangqi starting FEN
# Ordering is important because it is used to save/restore the randomized covered pieces in mongodb !!!
BLACK_SQUARES = ["a10", "b10", "c10", "d10", "f10", "g10", "h10", "i10", "b8", "h8", "a7", "c7", "e7", "g7", "i7"]  # fmt: skip
RED_SQUARES = ["a4", "c4", "e4", "g4", "i4", "b3", "h3", "a1", "b1", "c1", "d1", "f1", "g1", "h1", "i1"]  # fmt: skip

BLACK_PIECES = "rrnnbbaaccppppp"
RED_PIECES = BLACK_PIECES.upper()


def xiangqi_fen_to_pieces(fen):
    """Parse Xiangqi FEN (with '~') into list of 90 strings ('r', 'r~', or '.')."""
    rows = fen.split()[0].split("/")
    board = []
    for row in rows:
        i = 0
        while i < len(row):
            ch = row[i]
            if ch.isdigit():
                board.extend(["."] * int(ch))
                i += 1
            else:
                if i + 1 < len(row) and row[i + 1] == "~":
                    board.append(ch + "~")
                    i += 2
                else:
                    board.append(ch)
                    i += 1
    assert len(board) == 90
    return board


def pieces_to_fen(board):
    """Convert ['r~', '.', 'n', ...] -> FEN string."""
    fen_rows = []
    for r in range(10):
        row = board[r * 9 : (r + 1) * 9]
        fen_row = ""
        empty = 0
        for piece in row:
            if piece == ".":
                empty += 1
            else:
                if empty > 0:
                    fen_row += str(empty)
                    empty = 0
                fen_row += piece
        if empty > 0:
            fen_row += str(empty)
        fen_rows.append(fen_row)
    return "/".join(fen_rows)


@lru_cache(maxsize=None)
def square_to_index(square):
    """Convert 'b3' -> flat index 0..89."""
    col = ord(square[0]) - ord("a")
    row = 10 - int(square[1:])
    return row * 9 + col


@lru_cache(maxsize=None)
def index_to_square(index):
    row, col = divmod(index, 9)
    return f"{chr(ord('a')+col)}{10-row}"


def make_initial_mapping(black_pieces, red_pieces):
    """
    Create a Jeiqi-style piece shuffle mapping for the standard Xiangqi start:
    Returns dict: square -> piece letter (no '~')
    """
    mapping = {}
    for i in range(15):
        mapping[RED_SQUARES[i]] = red_pieces[i]
        mapping[BLACK_SQUARES[i]] = black_pieces[i]
    return mapping


def apply_move_and_transform(fen, move, mapping):
    """
    Apply a move (e.g. 'b3b10') to the FEN:
    - Moves the piece (captures if needed)
    - Replaces moved piece according to mapping[src]
    - Removes '~' if moved piece was uncovered (except kings)
    Returns the new FEN string.
    """
    parts = fen.split(" ")
    placement = parts[0]
    parts[1] = "w" if parts[1] == "b" else "b"
    rest = " ".join(parts[1:])

    board = xiangqi_fen_to_pieces(placement)
    if move[-1].isalpha():
        move = move[:-1]
    if move[2].isdigit():
        src, dst = move[0:3], move[3:].rstrip("+")
    else:
        src, dst = move[0:2], move[2:].rstrip("+")
    si, di = square_to_index(src), square_to_index(dst)

    piece = board[si]
    if piece == ".":
        raise ValueError(f"No piece at {src} to move")

    if src in mapping:
        new_piece = mapping.get(src)
        del mapping[src]
    else:
        new_piece = piece

    if dst in mapping:
        del mapping[dst]

    board[di] = new_piece
    board[si] = "."

    new_fen = pieces_to_fen(board)
    return f"{new_fen} {rest}"
