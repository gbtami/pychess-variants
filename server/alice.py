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
    def __init__(self, initial_fen=""):
        self.initial_fen = initial_fen if initial_fen else AliceBoard.start_fen()
        self.move_stack: list[str] = []
        self.board_id_stack: list[str] = []
        self.ply = 0
        self.fens = self.initial_fen.split(" | ")
        self.boards = (chess.Board(self.fens[0]), chess.Board(self.fens[1]))
        self.color = WHITE if self.fens[0].split()[1] == "w" else BLACK
        self.fen = self.initial_fen
        self.count_started = False

    @staticmethod
    def start_fen():
        return "%s | %s" % (START_FEN_0, START_FEN_1)

    @property
    def alice_fen(self):
        return "%s | %s" % (self.fens[0], self.fens[1])

    def push(self, uci, append=True):
        # TODO: handle castling and ep moves
        move = chess.Move.from_uci(uci)
        board_id = 0 if self.boards[0].piece_at(move.from_square) else 1
        print("push()", board_id, uci)
        self.board_id_stack.append(board_id)

        self.boards[board_id].push(move)
        # print("---", self.boards[board].move_stack)

        # Have to call BaseBoard remove_piece_at() and set_piece_at() methods
        # via super() to avoid clearing the move stack!
        piece = super(chess.Board, self.boards[board_id]).remove_piece_at(move.to_square)
        super(chess.Board, self.boards[1 - board_id]).set_piece_at(move.to_square, piece)

        self.boards[1 - board_id].turn = not self.boards[1 - board_id].turn

        self.fens[board_id] = self.boards[board_id].fen()
        self.fens[1 - board_id] = self.boards[1 - board_id].fen()

        self.print_pos()
        if append:
            self.move_stack.append(uci)
            self.ply += 1
        self.color = 1 - self.color
        self.fen = self.alice_fen

    def pop(self):
        uci = self.move_stack.pop()
        move = chess.Move.from_uci(uci)

        board_id = self.board_id_stack.pop()
        # print("pop()", board, uci)

        # Have to call BaseBoard remove_piece_at() and set_piece_at() methods
        # via super() to avoid clearing the move stack!
        piece = super(chess.Board, self.boards[1 - board_id]).remove_piece_at(move.to_square)
        self.boards[1 - board_id].turn = not self.boards[1 - board_id].turn

        super(chess.Board, self.boards[board_id]).set_piece_at(move.to_square, piece)
        self.boards[board_id].pop()

        self.fens[board_id] = self.boards[board_id].fen()
        self.fens[1 - board_id] = self.boards[1 - board_id].fen()

        self.ply -= 1
        self.color = 1 - self.color
        # self.print_pos()
        self.fen = self.alice_fen

    def get_san(self, move):
        board_id = 0 if self.boards[0].piece_at(chess.Move.from_uci(move).from_square) else 1
        return sf.get_san(VARIANT, self.fens[board_id], move, CHESS960, sf.NOTATION_SAN)

    def legal_moves(self):
        moves_0 = sf.legal_moves(VARIANT, self.fens[0], [], CHESS960)
        pseudo_legal_moves_0 = [uci for uci in moves_0 if self.boards[1].piece_at(chess.Move.from_uci(uci).to_square) is None]

        moves_1 = sf.legal_moves(VARIANT, self.fens[1], [], CHESS960)
        pseudo_legal_moves_1 = [uci for uci in moves_1 if self.boards[0].piece_at(chess.Move.from_uci(uci).to_square) is None]

        return pseudo_legal_moves_0 + pseudo_legal_moves_1

    def switch_fen_moving_color(self, fen):
        old = " %s" % fen[fen.find(" ") + 1]
        new = " w" if old == " b" else " b"
        return fen.replace(old, new)

    def is_invalid_by_checked(self):
        return (
            sf.gives_check(VARIANT, self.switch_fen_moving_color(self.fens[0]), [], CHESS960) or
            sf.gives_check(VARIANT, self.switch_fen_moving_color(self.fens[1]), [], CHESS960)
        )

    def legal_alice_moves(self, moves):
        legals = []
        for move in moves:
            self.push(move)
            if not self.is_invalid_by_checked():
                legals.append(move)
            self.pop()
        return legals

    def is_checked(self):
        gives_check_0 = sf.gives_check(VARIANT, self.fens[0], [], CHESS960)
        gives_check_1 = sf.gives_check(VARIANT, self.fens[1], [], CHESS960)
        return gives_check_0 or gives_check_1

    def insufficient_material(self):
        return False, False
        # TODO

    def is_immediate_game_end(self):
        return False, None

    def is_optional_game_end(self):
        return False, None
        # TODO

    def is_claimable_draw(self):
        optional_end, result = self.is_optional_game_end()
        return optional_end and result == 0

    def game_result(self):
        return sf.game_result(VARIANT, self.initial_fen, self.move_stack, CHESS960)

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
        print("push()", move)
        board.push(move)
        board.print_pos()
        print("is_checked()", board.is_checked())
        print(board.legal_moves())

    print("***********************************")
    print(board.boards[0].move_stack)
    print(board.boards[1].move_stack)
    for i in range(10):
        board.pop()
        board.print_pos()
