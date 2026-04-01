import unittest
from unittest.mock import patch

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

    def test_push_can_suppress_invalid_move_error(self):
        board = FairyBoard("chess")

        with patch("fairy.fairy_board.log.error") as mock_error:
            pushed = board.push("e2e5", raise_on_error=False)

        self.assertFalse(pushed)
        mock_error.assert_not_called()
        self.assertEqual(board.initial_fen, board.fen)


if __name__ == "__main__":
    unittest.main()
