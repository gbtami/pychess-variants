# -*- coding: utf-8 -*-
import logging
import re
import random

try:
    import pyffish as sf
    sf.set_option("VariantPath", "variants.ini")
except ImportError:
    print("No pyffish module installed!")

WHITE, BLACK = False, True
FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]

STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
SHOGI_FEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b - 1"
MINISHOGI_FEN = "rbsgk/4p/5/P4/KGSBR[-] b - 1"

log = logging.getLogger(__name__)


class FairyBoard:
    def __init__(self, variant, initial_fen="", chess960=False):
        self.variant = variant
        self.chess960 = chess960
        self.initial_fen = initial_fen if initial_fen else self.start_fen(variant, chess960)
        self.move_stack = []
        self.color = WHITE if self.initial_fen.split()[1] == "w" else BLACK
        self.fen = self.initial_fen
        if chess960 and initial_fen == self.start_fen(variant):
            self.chess960 = False

    def start_fen(self, variant, chess960=False):
        # pyffish gives internal color representation for shogi
        # "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1"
        if variant == "shogi":
            return SHOGI_FEN
        elif variant == "minishogi":
            return MINISHOGI_FEN
        else:
            if chess960:
                return self.shuffle_start()
            else:
                return sf.start_fen(variant)

    @property
    def initial_sfen(self):
        return "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"

    def push(self, move):
        try:
            self.move_stack.append(move)
            self.color = not self.color
            self.fen = self.get_fen()
        except Exception:
            self.move_stack.pop()
            self.color = not self.color
            raise

    def get_fen(self):
        if self.variant[-5:] == "shogi":
            # TODO: move this to pyffish.cpp
            parts = sf.get_fen(self.variant, self.initial_fen, self.move_stack).split()
            color = "w" if parts[1] == "b" else "b"
            placement, pockets = parts[0][:-1].split("[")
            if pockets == "":
                pockets = "-"
            ply = parts[-1]
            return "%s[%s] %s %s" % (placement, pockets, color, ply)
        else:
            try:
                return sf.get_fen(self.variant, self.initial_fen, self.move_stack, self.chess960)
            except Exception:
                log.error("ERROR: sf.get_fen() failed on %s %s %s" % (self.initial_fen, ",".join(self.move_stack), self.chess960))
                raise

    def get_san(self, move):
        return sf.get_san(self.variant, self.fen, move, self.chess960)

    def legal_moves(self):
        # print("   self.move_stack:", self.move_stack)
        legals = sf.legal_moves(self.variant, self.initial_fen, self.move_stack, self.chess960)
        # print("       legal_moves:", legals)
        return legals

    def is_checked(self):
        return sf.gives_check(self.variant, self.initial_fen, self.move_stack, self.chess960)

    def insufficient_material(self):
        return sf.has_insufficient_material(self.variant, self.initial_fen, self.move_stack, self.chess960)

    def is_immediate_game_end(self):
        return sf.is_immediate_game_end(self.variant, self.initial_fen, self.move_stack, self.chess960)

    def is_optional_game_end(self):
        return sf.is_optional_game_end(self.variant, self.initial_fen, self.move_stack, self.chess960)

    def is_claimable_draw(self):
        optional_end, result = self.is_optional_game_end()
        return optional_end and result == 0

    def print_pos(self):
        print()
        uni_pieces = {"R": "♜", "N": "♞", "B": "♝", "Q": "♛", "K": "♚", "P": "♟",
                      "r": "♖", "n": "♘", "b": "♗", "q": "♕", "k": "♔", "p": "♙", ".": "·", "/": "\n"}
        fen = self.fen
        if "[" in fen:
            board, rest = fen.split("[")
        else:
            board = fen.split()[0]
        board = re.sub(r"\d", (lambda m: "." * int(m.group(0))), board)
        print("", " ".join(uni_pieces.get(p, p) for p in board))

    def shuffle_start(self):
        """ Create random initial position.
            The king is placed somewhere between the two rooks.
            The bishops are placed on opposite-colored squares.
            Same for queen and archbishop in caparandom."""

        castl = ""
        capa = self.variant == "capablanca" or self.variant == "capahouse"

        # https://www.chessvariants.com/contests/10/crc.html
        # we don't skip spositions that have unprotected pawns
        if capa:
            board = [''] * 10
            positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            bright = [1, 3, 5, 7, 9]
            dark = [0, 2, 4, 6, 8]

            # 1. select queen or the archbishop to be placed first
            piece = random.choice("qa")

            # 2. place the selected 1st piece upon a bright square
            piece_pos = random.choice(bright)
            board[piece_pos] = piece
            positions.remove(piece_pos)
            bright.remove(piece_pos)

            # 3. place the selected 2nd piece upon a dark square
            piece_pos = random.choice(dark)
            board[piece_pos] = "q" if piece == "a" else "a"
            positions.remove(piece_pos)
            dark.remove(piece_pos)
        else:
            board = [''] * 8
            positions = [0, 1, 2, 3, 4, 5, 6, 7]
            bright = [1, 3, 5, 7]
            dark = [0, 2, 4, 6]

        # 4. one bishop has to be placed upon a bright square
        piece_pos = random.choice(bright)
        board[piece_pos] = 'b'
        positions.remove(piece_pos)

        # 5. one bishop has to be placed upon a dark square
        piece_pos = random.choice(dark)
        board[piece_pos] = 'b'
        positions.remove(piece_pos)

        if capa:
            # 6. one chancellor has to be placed upon a free square
            piece_pos = random.choice(positions)
            board[piece_pos] = 'c'
            positions.remove(piece_pos)
        else:
            piece_pos = random.choice(positions)
            board[piece_pos] = 'q'
            positions.remove(piece_pos)

        # 7. one knight has to be placed upon a free square
        piece_pos = random.choice(positions)
        board[piece_pos] = 'n'
        positions.remove(piece_pos)

        # 8. one knight has to be placed upon a free square
        piece_pos = random.choice(positions)
        board[piece_pos] = 'n'
        positions.remove(piece_pos)

        # 9. set the king upon the center of three free squares left
        piece_pos = positions[1]
        board[piece_pos] = 'k'

        # 10. set the rooks upon the both last free squares left
        piece_pos = positions[0]
        board[piece_pos] = 'r'
        castl += FILES[piece_pos]

        piece_pos = positions[2]
        board[piece_pos] = 'r'
        castl += FILES[piece_pos]

        fen = ''.join(board)
        if capa:
            body = '/pppppppppp/10/10/10/10/PPPPPPPPPP/'
        else:
            body = '/pppppppp/8/8/8/8/PPPPPPPP/'
        fen = fen + body + fen.upper() + ' w ' + castl.upper() + castl + ' - 0 1'
        return fen


if __name__ == '__main__':
    board = FairyBoard("shogi")
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())

    board = FairyBoard("placement")
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())

    board = FairyBoard("makruk")
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())

    board = FairyBoard("sittuyin")
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())

    board = FairyBoard("capablanca")
    print(board.fen)
    for move in ("e2e4", "d7d5", "e4d5", "c8i2", "d5d6", "i2j1", "d6d7", "j1e6", "d7e8c"):
        print("push move", move)
        board.push(move)
        board.print_pos()
        print(board.fen)
    print(board.legal_moves())

    FEN = "r8r/1nbqkcabn1/ppppppp1pp/10/9P/10/10/PPPPPPPPp1/1NBQKC2N1/R5RAB1[p] b - - 0 5"
    board = FairyBoard("grandhouse", initial_fen=FEN)
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())

    board = FairyBoard("minishogi")
    print(board.fen)
    board.print_pos()
    print(board.legal_moves())
