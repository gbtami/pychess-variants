# -*- coding: utf-8 -*-
import re

import pysfish as sf

WHITE, BLACK = False, True
FEN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"


class SeirawanBoard:
    def __init__(self, initial_fen=""):
        self.initial_fen = initial_fen if initial_fen else FEN_START
        self.move_stack = []
        self.color = WHITE if self.initial_fen.split()[1] == "w" else BLACK
        self.fen = self.initial_fen

    def push(self, move):
        self.move_stack.append(move)
        self.color = not self.color
        self.fen = self.get_fen()

    def start_fen(self, variant):
        return FEN_START

    def get_fen(self):
        return sf.get_fen(self.initial_fen, self.move_stack)

    def get_san(self, move):
        return sf.get_san(self.fen, move)

    def legal_moves(self):
        return sf.legal_moves(self.initial_fen, self.move_stack)

    def is_checked(self):
        return sf.gives_check(self.initial_fen, self.move_stack)

    def insufficient_material(self):
        w, b = sf.has_insufficient_material(self.initial_fen, self.move_stack)
        return w and b

    def is_optional_game_end(self):
        return sf.is_optional_game_end(self.initial_fen, self.move_stack)

    def is_claimable_draw(self):
        optional_end, result = self.is_optional_game_end()
        return optional_end and result == 0

    def print_pos(self):
        print()
        uni_pieces = {"R": "♜", "N": "♞", "B": "♝", "Q": "♛", "K": "♚", "P": "♟",
                      "r": "♖", "n": "♘", "b": "♗", "q": "♕", "k": "♔", "p": "♙", ".": "·", "/": "\n"}
        parts = self.get_fen().split("[")
        board = parts[0]
        board = re.sub(r"\d", (lambda m: "." * int(m.group(0))), board)
        print("", " ".join(uni_pieces.get(p, p) for p in board))


if __name__ == "__main__":
    board = SeirawanBoard()
    for move in ("b2b4", "d7d5", "b4b5", "c8h3h", "b5b6", "h3g2", "b6a7", "g2h1", "a7b8e"):
        print("push move", move)
        board.push(move)
        board.print_pos()
        print(board.get_fen())
    print(board.legal_moves())

    board = SeirawanBoard()
    for move in ("e2e4", "e7e5", "e1e2", "e8e7", "h2h3", "h7h6"):
        print("push move", move)
        board.push(move)
        board.print_pos()
        print(board.get_fen())
    print(board.legal_moves())
