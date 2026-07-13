from __future__ import annotations

import json
from unittest import TestCase
from unittest.mock import patch

from catalogued_variants import (
    FSF_CATALOGUED_BUILTIN_VARIANTS,
    _build_fsf_builtin_doc,
    _client_doc,
    catalogued_variant_rule_context,
)
from fsf_variant_info_fixture import fsf_piece, make_fsf_variant_info


class FsfBuiltinRulesIniTestCase(TestCase):
    def test_yarishogi_rules_ini_is_documentation_only(self) -> None:
        metadata = FSF_CATALOGUED_BUILTIN_VARIANTS["yarishogi"]
        start_fen = "rnnkbbr/7/ppppppp/7/7/7/PPPPPPP/7/RBBKNNR[-] w 0 1"
        info = make_fsf_variant_info(
            name="yarishogi",
            template="shogi",
            start_fen=start_fen,
            width=7,
            height=9,
            pieces=[
                fsf_piece("shogiPawn", "p"),
                fsf_piece("knight", "n"),
                fsf_piece("bishop", "b"),
                fsf_piece("rook", "r"),
                fsf_piece("king", "k"),
            ],
        )
        info["promotion"].update(
            {
                "shogiStyle": True,
                "promotedPieceTypes": {
                    "shogiPawn": "gold",
                    "knight": "gold",
                    "bishop": "gold",
                    "rook": "silver",
                },
            }
        )
        info["drops"].update({"enabled": True, "capturesToHand": True})

        with patch(
            "catalogued_variants.sf.variant_info",
            return_value=json.dumps(info),
            create=True,
        ):
            doc = _build_fsf_builtin_doc("yarishogi", metadata)

        self.assertEqual(doc["ini"], "")
        self.assertIn("customPiece1 = n:fRffN", doc["rulesIni"])
        self.assertEqual(set(doc["pieces"]), {"p", "n", "b", "r", "k"})
        self.assertEqual(doc["promotionRoles"], ["p", "n", "b", "r"])
        self.assertTrue(doc["captureToHand"])

        client_doc = _client_doc(doc)
        self.assertEqual(client_doc["ini"], "")
        self.assertNotIn("rulesIni", client_doc)
        self.assertEqual(client_doc["fsfBuiltinVariant"], "yarishogi")

        rule_context = catalogued_variant_rule_context(doc)
        self.assertTrue(rule_context["system"])
        self.assertEqual(rule_context["ini"], doc["rulesIni"])
        self.assertEqual(
            [diagram["piece"] for diagram in rule_context["customPieceDiagrams"]],
            ["n", "b", "r", "g", "s"],
        )
        self.assertGreater(len(rule_context["ruleSummary"]["sections"]), 3)


if __name__ == "__main__":
    import unittest

    unittest.main()
