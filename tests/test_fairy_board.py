from __future__ import annotations

import unittest
from unittest.mock import patch

import test_logger

from fairy.fairy_board import FairyBoard, modded_variant

test_logger.init_test_logger()


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


class FairyBoardEmbassyFenTestCase(unittest.TestCase):
    def test_modded_variant_uses_embassy_for_one_sided_castling_rights(self) -> None:
        fen = "rk7r/1pp2P1ppp/p7c1/3NPCP1b1/3P3p2/8P1/PPP4B1P/R3K2R2 w Q - 0 29"

        self.assertEqual(modded_variant("capablanca", False, fen), "embassy")

    def test_one_sided_custom_fen_castling_replays_under_embassy_rules(self) -> None:
        fen = "rk7r/1pp2P1ppp/p7c1/3NPCP1b1/3P3p2/8P1/PPP4B1P/R3K2R2 w Q - 0 29"
        board = FairyBoard("capablanca", fen, chess960=False)

        self.assertEqual(board.variant, "embassy")
        self.assertEqual(board.get_san("e1b1"), "O-O-O")
        self.assertTrue(board.push("e1b1", append=False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
