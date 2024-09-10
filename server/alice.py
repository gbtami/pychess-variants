from __future__ import annotations
from time import time

from collections.abc import Iterator
import multiprocessing
import multiprocessing.pool
import functools
import copy

# -*- coding: utf-8 -*-
from chess import Board, Move, D1, D8, F1, F8, square_file
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

CASTLED_ROOK_SQUARE = ((D1, D8), (F1, F8))


class AliceBoard:
    def __init__(self, initial_fen=""):
        self.nnue = False
        self.initial_fen = initial_fen if initial_fen else AliceBoard.start_fen()
        self.move_stack: list[str] = []
        self.castling_move_stack: list[bool] = []
        self.board_id_stack: list[str] = []
        self.ply = 0
        self.fens = self.initial_fen.split(" | ")
        self.boards = (Board(self.fens[0]), Board(self.fens[1]))
        self.color = WHITE if self.fens[0].split()[1] == "w" else BLACK
        self.fen = self.initial_fen
        self.count_started = False

    @staticmethod
    def start_fen():
        return "%s | %s" % (START_FEN_0, START_FEN_1)

    @property
    def alice_fen(self):
        return "%s | %s" % (self.fens[0], self.fens[1])

    def play_move(self, board_id, move, castling_move):
        self.boards[board_id].push(move)

        # Remove piece from the target square and put it to the other board
        # we have to call BaseBoard remove_piece_at() and set_piece_at() methods
        # via super() to avoid clearing the move stack!
        piece = super(Board, self.boards[board_id]).remove_piece_at(move.to_square)
        super(Board, self.boards[1 - board_id]).set_piece_at(move.to_square, piece)

        # Remove the castled rook and put it to the another board
        if castling_move:
            a_side = 0 if square_file(move.to_square) < square_file(move.from_square) else 1
            rook_to_square = CASTLED_ROOK_SQUARE[a_side][self.color]
            rook = super(Board, self.boards[board_id]).remove_piece_at(rook_to_square)
            super(Board, self.boards[1 - board_id]).set_piece_at(rook_to_square, rook)

        # Switch the other board turn color
        self.boards[1 - board_id].turn = not self.boards[1 - board_id].turn

        # Adjust both boards FEN
        self.fens[board_id] = self.boards[board_id].fen()
        self.fens[1 - board_id] = self.boards[1 - board_id].fen()

        self.color = 1 - self.color

        return castling_move

    def undo_move(self, board_id, move, castling_move):
        # Remove the castled rook and put it to the original board
        if castling_move:
            a_side = 0 if square_file(move.to_square) < square_file(move.from_square) else 1
            rook_to_square = CASTLED_ROOK_SQUARE[a_side][1 - self.color]
            rook = super(Board, self.boards[1 - board_id]).remove_piece_at(rook_to_square)
            super(Board, self.boards[board_id]).set_piece_at(rook_to_square, rook)

        # Remove piece from the target square and put it to the original board
        piece = super(Board, self.boards[1 - board_id]).remove_piece_at(move.to_square)
        self.boards[1 - board_id].turn = not self.boards[1 - board_id].turn

        super(Board, self.boards[board_id]).set_piece_at(move.to_square, piece)
        self.boards[board_id].pop()

        self.fens[board_id] = self.boards[board_id].fen()
        self.fens[1 - board_id] = self.boards[1 - board_id].fen()

        self.color = 1 - self.color

    def push(self, uci, append=True):
        move = Move.from_uci(uci)
        board_id = 0 if self.boards[0].piece_at(move.from_square) else 1
        castling_move = self.boards[board_id].is_castling(move)
        # print("push()", board_id, uci, castling_move)
        self.board_id_stack.append(board_id)

        self.play_move(board_id, move, castling_move)

        # self.print_pos()
        if append:
            self.move_stack.append(uci)
            self.castling_move_stack.append(castling_move)
            self.ply += 1
        self.fen = self.alice_fen

    def pop(self):
        uci = self.move_stack.pop()
        move = Move.from_uci(uci)

        board_id = self.board_id_stack.pop()
        castling_move = self.castling_move_stack.pop()
        # print("pop()", board_id, uci)

        self.undo_move(board_id, move, castling_move)

        self.ply -= 1
        # self.print_pos()
        self.fen = self.alice_fen

    def get_san(self, move):
        board_id = 0 if self.boards[0].piece_at(Move.from_uci(move).from_square) else 1
        return sf.get_san(VARIANT, self.fens[board_id], move, CHESS960, sf.NOTATION_SAN)

    def has_legal_move(self):
        legal_moves_0 = self.legal_alice_moves(0, self.pseudo_legal_moves(0))
        try:
            next(legal_moves_0)
            return True
        except StopIteration:
            legal_moves_1 = self.legal_alice_moves(1, self.pseudo_legal_moves(1))
            try:
                next(legal_moves_1)
                return True
            except StopIteration:
                return False

    def pseudo_legal_moves(self, board_id):
        moves = sf.legal_moves(VARIANT, self.fens[board_id], [], CHESS960)
        return (
            uci
            for uci in moves
            if self.boards[1 - board_id].piece_at(Move.from_uci(uci).to_square) is None
        )

    def legal_moves(self):
        return [move for move in self.legal_alice_moves(0, self.pseudo_legal_moves(0))] + [
            move for move in self.legal_alice_moves(1, self.pseudo_legal_moves(1))
        ]

    def switch_fen_moving_color(self, fen):
        old = " %s" % fen[fen.find(" ") + 1]
        new = " w" if old == " b" else " b"
        return fen.replace(old, new)

    def is_invalid_by_checked(self):
        return sf.gives_check(
            VARIANT, self.switch_fen_moving_color(self.fens[0]), [], CHESS960
        ) or sf.gives_check(VARIANT, self.switch_fen_moving_color(self.fens[1]), [], CHESS960)

    def legal_alice_moves(self, board_id, uci_moves):
        for uci in uci_moves:
            move = Move.from_uci(uci)
            castling_move = self.boards[board_id].is_castling(move)

            # We have to check that rook_to_square was vacant as well
            if castling_move:
                a_side = 0 if square_file(move.to_square) < square_file(move.from_square) else 1
                rook_to_square = CASTLED_ROOK_SQUARE[a_side][self.color]

                if self.boards[1 - board_id].piece_at(rook_to_square) is not None:
                    continue

            self.play_move(board_id, move, castling_move)

            ok = not self.is_invalid_by_checked()

            self.undo_move(board_id, move, castling_move)

            if ok:
                yield uci

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
        cur_color = self.color == WHITE
        board_id = 0 if self.boards[0].king(cur_color) is not None else 1
        return sf.game_result(VARIANT, self.fens[board_id], [], CHESS960)

    def print_pos(self):
        print("================")
        print(self.fens[0])
        print(self.boards[0].unicode(invert_color=True, empty_square="_"))
        print("----------------")
        print(self.fens[1])
        print(self.boards[1].unicode(invert_color=True, empty_square="_"))


def do_perft(depth, root, board):
    nodes = 0
    if depth == 0:
        return 1

    for move in board.legal_moves():
        board.push(move)
        count = do_perft(depth - 1, root - 1, board)
        nodes += count
        board.pop()

        if root > 0:
            print("%8s %10d %10d" % (move, count, nodes))

    return nodes


def parallel_perft(pool: multiprocessing.pool.Pool, depth, root, board):
    if depth == 1:
        return len(board.legal_moves())
    elif depth > 1:

        def successors(board) -> Iterator[AliceBoard()]:
            for move in board.legal_moves():
                board_after = copy.deepcopy(board)
                board_after.push(move)
                yield board_after

        return sum(
            pool.imap_unordered(functools.partial(do_perft, depth - 1, root), successors(board))
        )
    else:
        return 1


def perft(board, depth, root, pool: multiprocessing.pool.Pool):
    for i in range(depth):
        start_time = time()
        nodes = parallel_perft(pool, i + 1, root, board)
        ttime = time() - start_time
        print(
            "%2d %10d %5.2f %12.2fnps"
            % (i + 1, nodes, ttime, nodes / ttime if ttime > 0 else nodes)
        )


# You can run perft like this
# PYTHONPATH=server python3 server/alice.py
if __name__ == "__main__":
    sf.set_option("VariantPath", "variants.ini")
    # FEN = "r3k2r/1pp1pp2/4P3/2PP4/6n1/7p/5PPP/R3K2R b KQkq - 0 13 | 1q6/3b2b1/P1np2p1/8/8/2N1BN2/1pQ5/5B2 b - - 0 6"
    # board = AliceBoard(initial_fen=FEN)
    # perft(board, 2, 1)

    board = AliceBoard()
    # perft(board, 5, 1)
    pool = multiprocessing.Pool(6)
    perft(board, 5, 1, pool)
