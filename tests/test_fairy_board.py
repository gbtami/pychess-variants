import unittest

from fairy.fairy_board import FairyBoard


class FairyBoardPosNumTestCase(unittest.TestCase):
    def test_posnum_returns_minus_one_for_unknown_chess960_start(self):
        board = FairyBoard(
            "chess",
            initial_fen="8/8/8/8/8/8/8/8 w - - 0 1",
            chess960=True,
        )
        self.assertEqual(-1, board.posnum)

    def test_posnum_returns_minus_one_for_unknown_racingkings960_start(self):
        board = FairyBoard(
            "racingkings",
            initial_fen="8/8/8/8/8/8/8/8 w - - 0 1",
            chess960=True,
        )
        self.assertEqual(-1, board.posnum)


if __name__ == "__main__":
    unittest.main()
