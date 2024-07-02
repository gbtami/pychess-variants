# -*- coding: utf-8 -*-

import unittest

import pyffish as sf

from alice import AliceBoard

sf.set_option("VariantPath", "variants.ini")

# https://en.wikipedia.org/wiki/Alice_chess#Early_mates
MATE1 = ("e2e4", "d7d5", "f1e2", "d5e4", "e2b5")
MATE2 = ("e2e4", "d7d6", "f1c4", "d8d2", "c4b5")
MATE3 = ("e2e4", "e7e5", "d1h5", "g8f6", "h5e5")
MATE4 = ("e2e4", "h7h5", "f1e2", "h8h4", "e2h5", "h4e4", "e1f1", "d7d5", "d1e2", "c8h3")
MATE5 = ("d2d4", "e7e6", "d1d6", "f8e7", "d6e5", "e8f8", "c1h6")


class CheckMateTestCase(unittest.TestCase):
    def test_1(self):
        board = AliceBoard()
        for move in MATE1:
            board.push(move)
        self.assertTrue(board.is_checked())
        self.assertEqual(len(board.legal_moves()), 0)

    def test_2(self):
        board = AliceBoard()
        for move in MATE2:
            board.push(move)
        self.assertTrue(board.is_checked())
        self.assertEqual(len(board.legal_moves()), 0)

    def test_3(self):
        board = AliceBoard()
        for move in MATE3:
            board.push(move)
        self.assertTrue(board.is_checked())
        self.assertEqual(len(board.legal_moves()), 0)

    def test_4(self):
        board = AliceBoard()
        for move in MATE4:
            board.push(move)
        self.assertTrue(board.is_checked())
        self.assertEqual(len(board.legal_moves()), 0)

    def test_5(self):
        board = AliceBoard()
        for move in MATE5:
            board.push(move)
        self.assertTrue(board.is_checked())
        self.assertEqual(len(board.legal_moves()), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
