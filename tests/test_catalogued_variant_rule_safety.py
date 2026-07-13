import unittest

from aiohttp import web

import test_logger
from catalogued_variants import (
    _ensure_catalogued_rules_supported,
    _ensure_resolved_catalogued_rules_supported,
)
from fsf_variant_info import derive_catalogued_variant_info
from fsf_variant_info_fixture import fsf_piece, make_fsf_variant_info

test_logger.init_test_logger()


class CataloguedVariantRuleSafetyTestCase(unittest.TestCase):
    def test_rejects_two_board_variants_before_loading_fsf(self) -> None:
        ini = """[testbug:chess]
twoBoards = true
"""

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _ensure_catalogued_rules_supported(ini)

        self.assertIn("twoBoards", exc.exception.text)

    def test_rejects_unsupported_rules_inherited_from_template(self) -> None:
        info = make_fsf_variant_info()
        info["movement"]["cambodianMoves"] = True
        info["gameEnd"]["chasingRule"] = "axf"

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _ensure_resolved_catalogued_rules_supported(info)

        self.assertIn("cambodianMoves", exc.exception.text)
        self.assertIn("chasingRule", exc.exception.text)

    def test_rejects_generic_non_seirawan_gating_after_resolution(self) -> None:
        info = make_fsf_variant_info()
        info["gating"]["enabled"] = True

        with self.assertRaises(web.HTTPBadRequest) as exc:
            _ensure_resolved_catalogued_rules_supported(info)

        self.assertIn("gating", exc.exception.text)

    def test_accepts_supported_resolved_client_and_termination_rules(self) -> None:
        info = make_fsf_variant_info()
        info["gating"].update({"enabled": True, "seirawan": True})
        info["movement"]["passOnStalemate"]["white"] = True
        info["gameEnd"].update(
            {
                "perpetualCheckIllegal": True,
                "moveRepetitionIllegal": True,
                "nFoldRule": 4,
                "nFoldValue": "draw",
                "checkCounting": True,
            }
        )

        _ensure_resolved_catalogued_rules_supported(info)
        derived = derive_catalogued_variant_info(info)

        self.assertTrue(derived.rules_gate)
        self.assertTrue(derived.rules_pass)
        self.assertTrue(derived.legal_moves_need_history)
        self.assertTrue(derived.n_fold_is_draw)
        self.assertTrue(derived.show_check_counters)

    def test_regular_promotion_is_derived_from_resolved_piece_types(self) -> None:
        info = make_fsf_variant_info(
            pieces=[
                fsf_piece("pawn", "p"),
                fsf_piece("knight", "n"),
                fsf_piece("queen", "q"),
                fsf_piece("custom1", "h", custom_betza="NAD"),
                fsf_piece("king", "k"),
            ]
        )
        info["promotion"]["pieceTypes"] = {
            "white": ["queen", "custom1"],
            "black": ["queen", "custom1"],
        }

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.promotion_type, "regular")
        self.assertEqual(derived.promotion_roles, ["p"])
        self.assertEqual(derived.promotion_order, ["q", "h"])

    def test_shogi_promotion_and_promoted_royal_are_derived_from_resolved_mapping(self) -> None:
        info = make_fsf_variant_info(
            pieces=[
                fsf_piece("pawn", "p"),
                fsf_piece("knight", "n"),
                fsf_piece("custom1", "j", custom_betza="K"),
                fsf_piece("king", "k"),
            ]
        )
        info["promotion"].update(
            {
                "pieceTypes": {"white": [], "black": []},
                "promotedPieceTypes": {"pawn": "custom1", "king": "custom1"},
                "mandatoryPiece": True,
                "shogiStyle": True,
            }
        )
        info["extinction"].update(
            {
                "value": "loss",
                "pseudoRoyal": True,
                "pieceTypes": ["custom1", "king"],
                "pieceCount": 64,
            }
        )

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.promotion_type, "shogi")
        self.assertEqual(derived.promotion_roles, ["p", "k"])
        self.assertEqual(derived.promotion_order, ["+", ""])
        self.assertIn("k", derived.king_roles)
        self.assertIn("+k", derived.king_roles)
        self.assertTrue(derived.show_promoted)

    def test_promoted_drop_and_demotion_flags_enable_promoted_rendering(self) -> None:
        info = make_fsf_variant_info()
        info["promotion"].update({"demotion": True, "onCapture": True})
        info["drops"]["promoted"] = True

        self.assertTrue(derive_catalogued_variant_info(info).show_promoted)


if __name__ == "__main__":
    unittest.main()
