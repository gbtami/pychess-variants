from __future__ import annotations

from unittest import TestCase
from unittest.mock import patch

from catalogued_variants import (
    FSF_CATALOGUED_BUILTIN_VARIANTS,
    _build_fsf_builtin_doc,
    _client_doc,
    catalogued_variant_rule_context,
)


class FsfBuiltinRulesIniTestCase(TestCase):
    def test_yarishogi_rules_ini_is_documentation_only(self) -> None:
        metadata = FSF_CATALOGUED_BUILTIN_VARIANTS["yarishogi"]
        start_fen = "rnnkbbr/7/ppppppp/7/7/7/PPPPPPP/7/RBBKNNR[-] w 0 1"

        with patch("catalogued_variants.sf.start_fen", return_value=start_fen):
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
