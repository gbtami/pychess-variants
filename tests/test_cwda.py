from __future__ import annotations

import unittest
from types import SimpleNamespace

import fishnet
import pyffish as sf

from cwda import (
    CWDA_DEFAULT_FEN,
    CWDA_START_FENS,
    cwda_betza_diagram_groups,
    cwda_engine_variant,
)
from fairy.fairy_board import FairyBoard, modded_variant
from rated_start import can_rate_custom_start
from utils import sanitize_fen
from variants import ServerVariants


class ChessWithDifferentArmiesTestCase(unittest.TestCase):
    def test_movement_diagrams_are_grouped_by_fairy_army(self) -> None:
        groups = cwda_betza_diagram_groups()

        self.assertEqual(
            [group["name"] for group in groups],
            ["Colorbound Clobberers", "Nutty Knights", "Remarkable Rookies"],
        )
        self.assertEqual([len(group["diagrams"]) for group in groups], [4, 4, 4])
        self.assertEqual(
            [diagram["betza"] for group in groups for diagram in group["diagrams"]],
            [
                "BD",
                "WA",
                "FAD",
                "BN",
                "fsRbK",
                "FvN",
                "fhNbKsW",
                "KfsRfhN",
                "R4",
                "WD",
                "FDH",
                "RN",
            ],
        )
        self.assertTrue(
            all("<svg" in diagram["svg"] for group in groups for diagram in group["diagrams"])
        )

    def test_all_ordered_non_fide_matchups_are_available(self) -> None:
        self.assertEqual(ServerVariants.CWDA.translated_name, "CWDA")
        self.assertEqual(len(CWDA_START_FENS), 15)
        self.assertEqual(len(set(CWDA_START_FENS)), 15)

    def test_public_variant_routes_to_nine_matchup_profiles(self) -> None:
        profiles = {cwda_engine_variant(fen) for fen in CWDA_START_FENS}

        self.assertEqual(
            profiles,
            {
                "cwda-fide-clobberers",
                "cwda-fide-knights",
                "cwda-fide-rookies",
                "cwda-clobberers",
                "cwda-clobberers-knights",
                "cwda-clobberers-rookies",
                "cwda-knights",
                "cwda-knights-rookies",
                "cwda-rookies",
            },
        )
        self.assertEqual(modded_variant("cwda", False, ""), "cwda-fide-clobberers")
        self.assertEqual(
            modded_variant("cwda", False, CWDA_DEFAULT_FEN),
            "cwda-fide-clobberers",
        )

    def test_reversed_colors_use_the_same_rules_profile(self) -> None:
        normal = "gihokhig/pppppppp/8/8/8/8/PPPPPPPP/DWACKAWD w KQkq - 0 1"
        reversed_colors = "dwackawd/pppppppp/8/8/8/8/PPPPPPPP/GIHOKHIG w KQkq - 0 1"

        self.assertEqual(cwda_engine_variant(normal), "cwda-clobberers-knights")
        self.assertEqual(cwda_engine_variant(reversed_colors), "cwda-clobberers-knights")

    def test_fairy_board_keeps_public_start_but_uses_hidden_profile(self) -> None:
        board = FairyBoard("cwda")

        self.assertEqual(board.initial_fen, CWDA_DEFAULT_FEN)
        self.assertEqual(board.variant, "cwda-fide-clobberers")

    def test_all_curated_starts_are_valid_and_rated(self) -> None:
        for fen in CWDA_START_FENS:
            with self.subTest(fen=fen):
                self.assertEqual(sf.validate_fen(fen, cwda_engine_variant(fen), False), sf.FEN_OK)
                self.assertEqual(sanitize_fen("cwda", fen, False), (True, fen))
                self.assertTrue(can_rate_custom_start("cwda", fen))

    def test_promotion_targets_are_limited_to_the_armies_in_the_game(self) -> None:
        fen = "k7/7P/8/8/8/8/8/K7 w - - 0 1"

        def targets(profile: str) -> set[str]:
            return {
                move[-1]
                for move in sf.legal_moves(profile, fen, [], False)
                if move.startswith("h7h8")
            }

        self.assertEqual(targets("cwda-clobberers"), set("dwac"))
        self.assertEqual(targets("cwda-knights"), set("giho"))
        self.assertEqual(targets("cwda-rookies"), set("smfe"))
        self.assertEqual(targets("cwda-fide-clobberers"), set("rnbqdwac"))
        self.assertEqual(targets("cwda-clobberers-knights"), set("dwacgiho"))

    def test_colorbound_queenside_castling_uses_the_b_file(self) -> None:
        fen = "4k3/8/8/8/8/8/8/D3K2D w KQ - 0 1"
        moves = sf.legal_moves("cwda-clobberers", fen, [], False)

        self.assertIn("e1b1", moves)
        self.assertNotIn("e1c1", moves)

    def test_other_armies_use_standard_queenside_castling(self) -> None:
        fen = "4k3/8/8/8/8/8/8/S3K2S w KQ - 0 1"
        moves = sf.legal_moves("cwda-rookies", fen, [], False)

        self.assertIn("e1c1", moves)
        self.assertNotIn("e1b1", moves)

    def test_fishnet_payload_contains_only_the_profile_inheritance_chain(self) -> None:
        app_state = SimpleNamespace(catalogued_variants={})
        ini = fishnet.fishnet_variants_ini(app_state, "cwda-clobberers-knights")

        self.assertLess(
            ini.index("[cwda-base:chess]"),
            ini.index("[cwda-clobberers-knights:cwda-base]"),
        )
        self.assertNotIn("[cwda-fide-rookies:cwda-base]", ini)


if __name__ == "__main__":
    unittest.main(verbosity=2)
