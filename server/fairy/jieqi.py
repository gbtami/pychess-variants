import random
import re

# --- Constants for standard Xiangqi setup ---
BLACK_SQUARES = [
    "a10","b10","c10","d10","e10","f10","g10","h10","i10", # back rank
    "b8","h8", # cannons
    "a7","c7","e7","g7","i7", # pawns
]
BLACK_PIECES = [
    "r","n","b","a","k","a","b","n","r", # back rank
    "c","c", # cannons
    "p","p","p","p","p" # pawns
]

RED_SQUARES = [
    "a1","b1","c1","d1","e1","f1","g1","h1","i1", # back rank
    "b3","h3", # cannons
    "a4","c4","e4","g4","i4", # pawns
]
RED_PIECES = [
    "R","N","B","A","K","A","B","N","R", # back rank
    "C","C", # cannons
    "P","P","P","P","P" # pawns
]


# --- Utilities ---

def xiangqi_fen_to_pieces(fen):
    """Parse Xiangqi FEN (with '~') into list of 90 strings ('r', 'r~', or '.')."""
    rows = fen.split()[0].split('/')
    board = []
    for row in rows:
        i = 0
        while i < len(row):
            ch = row[i]
            if ch.isdigit():
                board.extend(['.'] * int(ch))
                i += 1
            else:
                if i + 1 < len(row) and row[i + 1] == '~':
                    board.append(ch + '~')
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
        row = board[r*9:(r+1)*9]
        fen_row = ""
        empty = 0
        for piece in row:
            if piece == '.':
                empty += 1
            else:
                if empty > 0:
                    fen_row += str(empty)
                    empty = 0
                fen_row += piece
        if empty > 0:
            fen_row += str(empty)
        fen_rows.append(fen_row)
    return '/'.join(fen_rows)

def square_to_index(square):
    """Convert 'b3' -> flat index 0..89."""
    col = ord(square[0]) - ord('a')
    row = 10 - int(square[1:])
    return row * 9 + col

def index_to_square(index):
    row, col = divmod(index, 9)
    return f"{chr(ord('a')+col)}{10-row}"

def parse_move(move):
    """Parse move like 'b3b10' into (src, dst). Handles 1- or 2-digit ranks."""
    match = re.fullmatch(r'([a-i][1-9]|[a-i]10)([a-i][1-9]|[a-i]10)', move)
    if not match:
        raise ValueError(f"Invalid move format: {move}")
    return match.group(1), match.group(2)


# --- Jeiqi initial mapping ---

def make_initial_mapping():
    """
    Create a Jeiqi-style piece shuffle mapping for the standard Xiangqi start:
    - Kings stay fixed (e10 for black, e1 for red)
    - Other pieces on each side are shuffled within their own side
    Returns dict: square -> piece letter (no '~')
    """
    mapping = {}

    # Black side
    black_positions = [sq for sq in BLACK_SQUARES if sq != "e10"]
    black_pieces = [p for p, sq in zip(BLACK_PIECES, BLACK_SQUARES) if sq != "e10"]
    random.shuffle(black_pieces)
    for sq, piece in zip(black_positions, black_pieces):
        mapping[sq] = piece
    mapping["e10"] = "k" # king

    # Red side
    red_positions = [sq for sq in RED_SQUARES if sq != "e1"]
    red_pieces = [p for p, sq in zip(RED_PIECES, RED_SQUARES) if sq != "e1"]
    random.shuffle(red_pieces)
    for sq, piece in zip(red_positions, red_pieces):
        mapping[sq] = piece
    mapping["e1"] = "K" # king

    return mapping


# --- Core Move Logic ---

def apply_move_and_transform(fen, move, mapping):
    """
    Apply a move (e.g. 'b3b10') to the FEN:
    - Moves the piece (captures if needed)
    - Replaces moved piece according to mapping[src]
    - Removes '~' if moved piece was uncovered (except kings)
    Returns the new FEN string.
    """
    parts = fen.split(' ')
    placement = parts[0]
    rest = ' '.join(parts[1:]) if len(parts) > 1 else ''

    board = xiangqi_fen_to_pieces(placement)
    src, dst = parse_move(move)
    si, di = square_to_index(src), square_to_index(dst)

    piece = board[si]
    if piece == '.':
        raise ValueError(f"No piece at {src} to move")

    base_piece = piece.replace('~','')
    if base_piece.lower() == 'k':
        # kings always stay covered
        new_piece = mapping.get(src, base_piece)
    else:
        new_piece = mapping.get(src, base_piece)

    board[di] = new_piece
    board[si] = '.'

    new_fen = pieces_to_fen(board)
    return f"{new_fen} {rest}".strip()