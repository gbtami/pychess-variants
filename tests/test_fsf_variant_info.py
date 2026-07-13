from __future__ import annotations

import unittest

from fsf_variant_info import (
    FsfVariantInfoError,
    derive_catalogued_variant_info,
    validate_fsf_variant_info,
)
from fsf_variant_info_fixture import fsf_piece, make_fsf_variant_info


class FsfVariantInfoTestCase(unittest.TestCase):
    def test_complete_schema_is_validated(self):
        info = make_fsf_variant_info(name="complete")

        self.assertEqual(validate_fsf_variant_info(info, expected_name="complete"), info)

    def test_incomplete_stored_schema_is_rejected(self):
        info = make_fsf_variant_info(name="broken")
        del info["gameEnd"]["checking"]

        with self.assertRaisesRegex(FsfVariantInfoError, "incomplete gameEnd"):
            validate_fsf_variant_info(info, expected_name="broken")

    def test_capture_to_hand_uses_reachable_sources_and_excludes_royals(self):
        pieces = [
            fsf_piece("king", "k"),
            fsf_piece("shogiPawn", "p"),
            fsf_piece("gold", "g"),
            fsf_piece("rook", "r"),
        ]
        info = make_fsf_variant_info(
            name="smallshogi",
            template="shogi",
            start_fen="4k4/9/9/9/9/9/9/9/4K3P[-] w 0 1",
            width=9,
            height=9,
            pieces=pieces,
        )
        info["drops"].update({"enabled": True, "capturesToHand": True})
        info["promotion"].update(
            {
                "shogiStyle": True,
                "pawnTypes": {"white": ["shogiPawn"], "black": ["shogiPawn"]},
                "promotedPieceTypes": {"shogiPawn": "gold"},
            }
        )

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.pocket_roles, ["p"])
        self.assertNotIn("k", derived.pocket_roles)
        self.assertNotIn("g", derived.pocket_roles)
        self.assertNotIn("r", derived.pocket_roles)

    def test_promoted_royal_source_is_added_to_king_roles(self):
        pieces = [fsf_piece("king", "k"), fsf_piece("commoner", "j")]
        info = make_fsf_variant_info(name="royalpromotion", pieces=pieces)
        info["promotion"].update({"shogiStyle": True, "promotedPieceTypes": {"king": "commoner"}})
        info["extinction"].update(
            {"value": "loss", "pseudoRoyal": True, "pieceTypes": ["commoner"]}
        )
        info["royalPieceTypes"] = ["king", "commoner"]

        derived = derive_catalogued_variant_info(info)

        self.assertIn("j", derived.king_roles)
        self.assertIn("+k", derived.king_roles)


if __name__ == "__main__":
    unittest.main()
