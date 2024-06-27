from __future__ import annotations

# -*- coding: utf-8 -*-
import chess
from fairy import BLACK, WHITE

import logging
log = logging.getLogger(__name__)

try:
    import pyffish as sf
except ImportError:
    log.error("No pyffish module installed!", exc_info=True)


VARIANT = "alice"
CHESS960 = False
COUNT_STARTED = False
START_FEN_0 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
START_FEN_1 = "8/8/8/8/8/8/8/8 w - - 0 1"


class AliceBoard:
    def __init__(self):
        self.move_stack: list[str] = []
        self.move_board_stack: list[str] = []
        self.ply = 0
        self.color = WHITE
        self.fens = [START_FEN_0, START_FEN_1]
        self.boards = (chess.Board(START_FEN_0), chess.Board(START_FEN_1))
        self.initial_fen = "%s | %s" % (self.fens[0], self.fens[1])
        self.count_started = False

    def push(self, uci, append=True):
        # TODO: handle castling and ep moves
        move = chess.Move.from_uci(uci)
        board = 0 if self.boards[0].piece_at(move.from_square) else 1
        print("push()", board, uci)
        self.move_board_stack.append(board)

        self.boards[board].push(move)
        print("---", self.boards[board].move_stack)

        # Have to call BaseBoard remove_piece_at() and set_piece_at() methods
        # via super() to avoid clearing the move stack!
        piece = super(chess.Board, self.boards[board]).remove_piece_at(move.to_square)
        super(chess.Board, self.boards[1 - board]).set_piece_at(move.to_square, piece)

        self.boards[1 - board].turn = not self.boards[1 - board].turn

        self.fens[board] = self.boards[board].fen()
        self.fens[1 - board] = self.boards[1 - board].fen()

        self.print_pos()
        if append:
            self.move_stack.append(uci)
            self.ply += 1
        self.color = WHITE if self.color == BLACK else BLACK

    def pop(self):
        uci = self.move_stack.pop()
        move = chess.Move.from_uci(uci)

        board = self.move_board_stack.pop()
        print("pop()", board, uci)

        # Have to call BaseBoard remove_piece_at() and set_piece_at() methods
        # via super() to avoid clearing the move stack!
        piece = super(chess.Board, self.boards[1 - board]).remove_piece_at(move.to_square)
        self.boards[1 - board].turn = not self.boards[1 - board].turn

        super(chess.Board, self.boards[board]).set_piece_at(move.to_square, piece)
        self.boards[board].pop()

        self.fens[board] = self.boards[board].fen()
        self.fens[1 - board] = self.boards[1 - board].fen()

        self.ply -= 1
        self.color = not self.color
        self.print_pos()

    def get_san(self, move):
        return sf.get_san(VARIANT, self.fen, move, CHESS960, sf.NOTATION_SAN)

    def legal_moves(self):
        moves_0 = sf.legal_moves(VARIANT, self.fens[0], [], CHESS960)
        pseudo_legal_moves_0 = [uci for uci in moves_0 if self.boards[1].piece_at(chess.Move.from_uci(uci).to_square) is None]

        moves_1 = sf.legal_moves(VARIANT, self.fens[1], [], CHESS960)
        pseudo_legal_moves_1 = [uci for uci in moves_1 if self.boards[0].piece_at(chess.Move.from_uci(uci).to_square) is None]

        return pseudo_legal_moves_0 + pseudo_legal_moves_1

    def is_checked(self):
        gives_check_0 = sf.gives_check(VARIANT, self.fens[0], [], False)
        gives_check_1 = sf.gives_check(VARIANT, self.fens[1], [], False)
        return gives_check_0 or gives_check_1

    def insufficient_material(self):
        return sf.has_insufficient_material(VARIANT, self.fen, [], CHESS960)

    def is_immediate_game_end(self):
        immediate_end, result = sf.is_immediate_game_end(
            VARIANT, self.initial_fen, self.move_stack, CHESS960
        )
        return immediate_end, result

    def is_optional_game_end(self):
        return sf.is_optional_game_end(
            VARIANT,
            self.initial_fen,
            self.move_stack,
            CHESS960,
            COUNT_STARTED,
        )

    def is_claimable_draw(self):
        optional_end, result = self.is_optional_game_end()
        return optional_end and result == 0

    def game_result(self):
        return sf.game_result(VARIANT, self.initial_fen, self.move_stack, CHESS960)

    @property
    def fen(self):
        return "%s | %s" % (self.fens[0], self.fens[1])

    def print_pos(self):
        print("================")
        print(self.fens[0])
        print(self.boards[0].unicode(invert_color=True, empty_square="_"))
        print("----------------")
        print(self.fens[1])
        print(self.boards[1].unicode(invert_color=True, empty_square="_"))


if __name__ == "__main__":
    sf.set_option("VariantPath", "variants.ini")

    board = AliceBoard()
    print(board.fen)
    for move in (
        "e2e4",
        "h7h5",
        "f1e2",
        "h8h4",
        "e2h5",
        "h4e4",
        "e1f1",
        "d7d5",
        "d1e2",
        "c8h3",
    ):
        # print("push()", move)
        board.push(move)
        # board.print_pos()
        print("is_checked()", board.is_checked())
        print(board.legal_moves())

    print("***********************************")
    print(board.boards[0].move_stack)
    print(board.boards[1].move_stack)
    for i in range(10):
        board.pop()
