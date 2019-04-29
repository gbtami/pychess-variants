# -*- coding: utf-8 -*-
import re

import pyffish as sf

WHITE, BLACK = False, True


class FairyBoard:
    def __init__(self, variant, initial_fen=""):
        self.variant = variant
        self.initial_fen = initial_fen if initial_fen else self.start_fen(variant)
        self.move_stack = []
        self.color = WHITE if self.initial_fen.split()[1] == "w" else BLACK
        self.fen = self.initial_fen

    def start_fen(self, variant):
        # pyffish gives internal color representation for shogi
        # "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1"
        if self.variant == "shogi":
            return "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] b - 1"
        else:
            return sf.start_fen(variant)

    def push(self, move):
        self.move_stack.append(move)
        self.color = not self.color
        self.fen = self.get_fen()

    def get_fen(self):
        if self.variant == "shogi":
            # TODO: move this to pyffish.cpp
            parts = sf.get_fen(self.variant, self.initial_fen, self.move_stack).split()
            color = "w" if parts[1] == "b" else "b"
            placement, pockets = parts[0][:-1].split("[")
            if pockets == "":
                pockets = "-"
            ply = parts[-1]
            return "%s[%s] %s %s" % (placement, pockets, color, ply)
        else:
            return sf.get_fen(self.variant, self.initial_fen, self.move_stack)

    def legal_moves(self):
        return sf.legal_moves(self.variant, self.initial_fen, self.move_stack)

    def is_checked(self):
        return sf.gives_check(self.variant, self.initial_fen, self.move_stack)

    def insufficient_material(self):
        w, b = sf.has_insufficient_material(self.variant, self.initial_fen, self.move_stack)
        return w and b

    def is_immediate_game_end(self):
        return sf.is_immediate_game_end(self.variant, self.initial_fen, self.move_stack)

    def is_optional_game_end(self):
        return sf.is_optional_game_end(self.variant, self.initial_fen, self.move_stack)

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
