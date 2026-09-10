from __future__ import annotations

import unittest
from unittest.mock import patch

import pyffish as sf
import test_logger
from fairy.fairy_board import BLACK, FairyBoard, get_san_moves, modded_variant, validate_fen
from variants import (
    ServerVariants,
    register_catalogued_server_variant,
    unregister_catalogued_server_variant,
)

test_logger.init_test_logger()


class FairyBoardVariantNameTestCase(unittest.TestCase):
    def test_site_960_suffix_still_selects_randomized_base_variant(self):
        for variant in ServerVariants:
            if not variant.chess960:
                continue
            with self.subTest(variant=variant.server_name):
                with patch.object(
                    FairyBoard, "shuffle_start", return_value="random start"
                ) as shuffle:
                    fen = FairyBoard.start_fen(variant.server_name)
                shuffle.assert_called_once_with(variant.uci_variant)
                self.assertEqual(
                    fen, "random start | random start" if variant.two_boards else "random start"
                )

                if not variant.two_boards:
                    initial_fen = FairyBoard.start_fen(variant.uci_variant, chess960=True)
                    board = FairyBoard(variant.server_name, initial_fen)
                    self.assertEqual(board.variant, variant.uci_variant)
                    self.assertTrue(board.chess960)
                    self.assertTrue(board.has_legal_move())

    def test_community_960_name_preserves_fixed_start_and_castling_rules(self):
        name = "pawnsideways960"
        fen = "4k3/8/8/8/8/8/8/RK1R4 w DA - 0 1"
        sf.load_variant_config(f"[{name}:pawnsideways]\nchess960 = true\nstartFen = {fen}\n")
        register_catalogued_server_variant(name, name)
        self.addCleanup(unregister_catalogued_server_variant, name)

        with patch.object(FairyBoard, "shuffle_start", side_effect=AssertionError("randomized")):
            for _ in range(2):
                board = FairyBoard(name)
                self.assertEqual(board.variant, name)
                self.assertEqual(board.initial_fen, fen)
                self.assertFalse(board.chess960)
                self.assertEqual(validate_fen(fen, name, False), sf.FEN_OK)
                self.assertIn("b1d1", board.legal_moves())
                self.assertEqual(board.get_san("b1d1"), "O-O")
                self.assertEqual(
                    get_san_moves(name, fen, ["b1d1"], False, sf.NOTATION_SAN), ["O-O"]
                )
                board.push("b1d1")
                self.assertEqual(board.fen.split()[0], "4k3/8/8/8/8/8/8/R4RK1")


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

    def test_failed_non_appending_push_restores_every_board_field(self):
        board = FairyBoard("chess")
        board.move_stack = ["e2e4", "e2e4"]
        board.ply = 2
        board.color = BLACK
        before = (board.fen, board.color, board.ply, list(board.move_stack))

        pushed = board.push("e2e5", append=False, raise_on_error=False)

        self.assertFalse(pushed)
        self.assertEqual(before, (board.fen, board.color, board.ply, board.move_stack))


class FairyBoardInitialFenValidationTestCase(unittest.TestCase):
    def test_rejects_initial_fen_without_side_to_move(self) -> None:
        with self.assertRaisesRegex(ValueError, "explicit side to move"):
            FairyBoard("chess", initial_fen="8/8/8/8/8/8/8/8")

    def test_rejects_default_fen_without_side_to_move(self) -> None:
        with (
            patch("fairy.fairy_board.FairyBoard.start_fen", return_value="8/8/8/8/8/8/8/8"),
            self.assertRaisesRegex(ValueError, "explicit side to move"),
        ):
            FairyBoard("chess")


class FairyBoardDobutsuGameEndTestCase(unittest.TestCase):
    def test_try_win_requires_a_safe_lion(self) -> None:
        fen = "1L1/1g1/1G1/1l1[] w - - 0 1"
        cases = (
            ("b2a2", (True, sf.VALUE_MATE)),
            ("b4a4", (True, -sf.VALUE_MATE)),
            ("b2b3", (True, sf.VALUE_DRAW)),
            ("b4b3", (False, 0)),
        )

        for move, expected in cases:
            with self.subTest(move=move):
                board = FairyBoard("dobutsu", initial_fen=fen)

                self.assertTrue(board.push(move))
                self.assertEqual(expected, board.is_immediate_game_end())


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
