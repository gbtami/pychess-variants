from __future__ import annotations

import unittest
from unittest.mock import patch

import pyffish as sf
from fairy.fairy_board import RANDOM_START_VARIANTS, FairyBoard
from fairy.paradigm import PARADIGM_FENS


class ParadigmStartTestCase(unittest.TestCase):
    def test_has_exactly_thirty_mirrored_orthodox_castling_starts(self) -> None:
        self.assertEqual(len(PARADIGM_FENS), 30)
        self.assertEqual(len(set(PARADIGM_FENS)), 30)

        for fen in PARADIGM_FENS:
            board, turn, castling, ep, halfmove, fullmove = fen.split()
            ranks = board.split("/")
            self.assertEqual(ranks[1:7], ["pppppppp", "8", "8", "8", "8", "PPPPPPPP"])
            self.assertEqual(ranks[7], ranks[0].upper())
            self.assertEqual(ranks[0][0], "r")
            self.assertEqual(ranks[0][4], "k")
            self.assertEqual(ranks[0][7], "r")
            self.assertEqual(sorted(ranks[0][1:4] + ranks[0][5:7]), ["b", "b", "n", "n", "q"])
            self.assertEqual(
                (turn, castling, ep, halfmove, fullmove),
                ("w", "KQkq", "-", "0", "1"),
            )
            self.assertEqual(sf.validate_fen(fen, "paradigm", False), sf.FEN_OK)

    def test_is_randomized_without_enabling_chess960(self) -> None:
        self.assertIn("paradigm", RANDOM_START_VARIANTS)
        chosen = PARADIGM_FENS[-1]
        with patch("fairy.fairy_board.random.choice", return_value=chosen):
            self.assertEqual(FairyBoard.start_fen("paradigm", chess960=False), chosen)


if __name__ == "__main__":
    unittest.main()
