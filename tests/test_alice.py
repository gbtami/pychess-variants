# -*- coding: utf-8 -*-

import unittest

import pyffish as sf
from chess import A1, C1, D1, E1, F1, A8, B8, C8, D8, E8, F8, G8, H8, KING, QUEEN, ROOK

from alice import AliceBoard, START_FEN_0, START_FEN_1

sf.set_option("VariantPath", "variants.ini")

# https://en.wikipedia.org/wiki/Alice_chess#Early_mates
MATE1 = ("e2e4", "d7d5", "f1e2", "d5e4", "e2b5")
MATE2 = ("e2e4", "d7d6", "f1c4", "d8d2", "c4b5")
MATE3 = ("e2e4", "e7e5", "d1h5", "g8f6", "h5e5")
MATE4 = ("e2e4", "h7h5", "f1e2", "h8h4", "e2h5", "h4e4", "e1f1", "d7d5", "d1e2", "c8h3")
MATE5 = ("d2d4", "e7e6", "d1d6", "f8e7", "d6e5", "e8f8", "c1h6")

# https://en.wikipedia.org/wiki/Alice_chess#Example_game
# Paul Yearout vs. George Jelliss, 1996 AISE Grand Prix
# TODO: SAN ambiguation of 6...Rg8 is missing in alice.py (it should be 6...Rbg8)
GAME_PART1 = (
    "d2d3",
    "g8f6",
    "b1c3",
    "c7c5",
    "d1d2",
    "b8c6",
    "d3d4",
    "a8b8",
    "e2e3",
    "g7g5",
    "f2f4",
    "b8g8",
    "c3d5",
    "h7h6",
    "g1f3",
    "g5f4",
    "c1f4",
    "g8g4",
    "f4e5",
    "h8h5",
    "e1c1",
)
GAME_PART2 = (
    "f6e4",
    "e5c7",
    "g4a4",
    "f1a6",
    "f8g7",
    "a6b5",
    "a4c4",
    "c1b1",
    "h5f5",
    "c7a5",
    "f5d5",
    "d2d5",
    "d8a5",
    "a2a3",
    "a5d2",
    "d5d7",
    "e8f8",
    "d7g7",
    "d2c3",
    "d1d8",
)

# https://github.com/gbtami/pychess-variants/issues/1570
GHOST_ROOKS_PART1 = (
    "e2e4",
    "e7e5",
    "b1c3",
    "g8f6",
    "c3d5",
    "f6e4",
    "d5c7",
    "f8d6",
    "f1d3",
    "d6c7",
)
GHOST_ROOKS_PART2 = (
    "f2f3",
    "e4d6",
    "g1e2",
    "d8e7",
    "e2d4",
)

# https://github.com/gbtami/pychess-variants/issues/1604
QUEEN_DISAPPEARED = (
    "d2d4",
    "d7d5",
    "d1d8",
    "c8d7",
    "b1c3",
    "g8f6",
    "c3d5",
    "b8a6",
    "c1g5",
    "a8c8",
)


class AliceTestCase(unittest.TestCase):
    def test_checkmate(self):
        for movelist in (MATE1, MATE2, MATE3, MATE4, MATE5):
            board = AliceBoard()
            for move in movelist:
                board.push(move)
            self.assertTrue(board.is_checked())
            self.assertFalse(board.has_legal_move())

            for _ in range(len(movelist)):
                board.pop()
            self.assertEqual(board.fens[0], START_FEN_0)
            self.assertEqual(board.fens[1], START_FEN_1)

    def test_game_with_castling(self):
        board = AliceBoard()
        for move in GAME_PART1:
            board.push(move)

        # After 11. 0-0-0
        self.assertIsNone(board.boards[0].piece_at(A1))
        self.assertIsNone(board.boards[0].piece_at(C1))
        self.assertIsNone(board.boards[0].piece_at(D1))
        self.assertIsNone(board.boards[0].piece_at(E1))

        self.assertEqual(board.boards[1].piece_type_at(C1), KING)
        self.assertEqual(board.boards[1].piece_type_at(D1), ROOK)

        # The black queen is now effectively 'pinned': 11...Q–c7/b6?? 12.Qd8#.)
        board.push("d8b6")
        board.push("d1d8")
        self.assertTrue(board.is_checked())
        self.assertFalse(board.has_legal_move())
        board.pop()
        board.pop()

        for move in GAME_PART2:
            board.push(move)

        # Black resigns. If 21...Bd7/Be6/Nf6 [then] 22.Qg8/Re8/Qh8#
        board.push("c8d7")
        board.push("g7g8")
        self.assertTrue(board.is_checked())
        self.assertFalse(board.has_legal_move())
        board.pop()
        board.pop()

        board.push("c8e6")
        board.push("d8e8")
        self.assertTrue(board.is_checked())
        self.assertFalse(board.has_legal_move())
        board.pop()
        board.pop()

        board.push("e4f6")
        board.push("g7h8")
        self.assertTrue(board.is_checked())
        self.assertFalse(board.has_legal_move())
        board.pop()
        board.pop()

        for _ in range(len(GAME_PART1) + len(GAME_PART2)):
            board.pop()
        self.assertEqual(board.fens[0], START_FEN_0)
        self.assertEqual(board.fens[1], START_FEN_1)

    def test_game_without_castling1(self):
        board = AliceBoard()
        for move in GHOST_ROOKS_PART1:
            board.get_san(move)
            board.legal_moves()
            board.push(move)

        # After 5...Bxc7
        self.assertIsNone(board.boards[0].piece_at(F8))
        self.assertIsNone(board.boards[1].piece_at(F8))

        for move in GHOST_ROOKS_PART2:
            board.get_san(move)
            board.legal_moves()
            board.push(move)

        # After 8. Nd4
        self.assertIsNone(board.boards[0].piece_at(F1))
        self.assertIsNone(board.boards[1].piece_at(F1))

    def test_game_without_castling2(self):
        board = AliceBoard()
        for move in QUEEN_DISAPPEARED:
            board.get_san(move)
            board.legal_moves()
            board.push(move)

        # After 5...Rc8
        self.assertIsNone(board.boards[0].piece_at(D8))
        self.assertEqual(board.boards[1].piece_type_at(D8), QUEEN)

    def test_castling(self):
        FEN = "r3k2r/1pp1pp2/4P3/2PP4/6n1/7p/5PPP/R3K2R b KQkq - 0 13 | 1q6/3b2b1/P1np2p1/8/8/2N1BN2/1pQ5/5B2 b - - 0 6"
        board = AliceBoard(initial_fen=FEN)

        move = "e8c8"
        board.get_san(move)
        board.legal_moves()
        board.push(move)

        self.assertIsNone(board.boards[0].piece_at(A8))
        self.assertIsNone(board.boards[0].piece_at(B8))
        self.assertIsNone(board.boards[0].piece_at(C8))
        self.assertIsNone(board.boards[0].piece_at(D8))
        self.assertIsNone(board.boards[0].piece_at(E8))
        self.assertIsNone(board.boards[0].piece_at(F8))
        self.assertIsNone(board.boards[0].piece_at(G8))
        self.assertEqual(board.boards[1].piece_type_at(C8), KING)
        self.assertEqual(board.boards[1].piece_type_at(D8), ROOK)
        self.assertEqual(board.boards[0].piece_type_at(H8), ROOK)

        board.pop()
        self.assertEqual(board.alice_fen, FEN)

        move = "e8g8"
        board.get_san(move)
        board.legal_moves()
        board.push(move)

        self.assertIsNone(board.boards[0].piece_at(B8))
        self.assertIsNone(board.boards[0].piece_at(C8))
        self.assertIsNone(board.boards[0].piece_at(D8))
        self.assertIsNone(board.boards[0].piece_at(E8))
        self.assertIsNone(board.boards[0].piece_at(F8))
        self.assertIsNone(board.boards[0].piece_at(G8))
        self.assertIsNone(board.boards[0].piece_at(H8))
        self.assertEqual(board.boards[1].piece_type_at(G8), KING)
        self.assertEqual(board.boards[0].piece_type_at(A8), ROOK)
        self.assertEqual(board.boards[1].piece_type_at(F8), ROOK)

        board.pop()
        self.assertEqual(board.alice_fen, FEN)


if __name__ == "__main__":
    unittest.main(verbosity=2)
