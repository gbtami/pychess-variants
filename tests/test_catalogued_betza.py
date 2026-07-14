from __future__ import annotations

import unittest
from unittest.mock import patch

import catalogued_betza
from catalogued_betza import catalogued_betza_diagrams
from fsf_variant_info_fixture import fsf_piece, make_fsf_variant_info


class CataloguedBetzaDiagramTestCase(unittest.TestCase):
    def setUp(self) -> None:
        catalogued_betza._cached_betza_svg.cache_clear()
        catalogued_betza._cached_piece_diagram_definitions.cache_clear()
        catalogued_betza._cached_catalogued_betza_diagrams.cache_clear()

    def test_custom_piece_diagrams_are_generated_from_betza_definitions(self):
        diagrams = catalogued_betza_diagrams(
            {
                "ini": """
                [testvariant:chess]
                customPiece1 = n:N
                customPiece2 = a:BN
                """,
                "width": 8,
                "height": 8,
            }
        )

        self.assertEqual([diagram["piece"] for diagram in diagrams], ["n", "a"])
        self.assertEqual([diagram["betza"] for diagram in diagrams], ["N", "BN"])
        self.assertIn("<svg", diagrams[0]["svg"])
        self.assertIn("Custom piece 1", diagrams[0]["title"])

    def test_resolved_custom_piece_definition_is_authoritative(self):
        pieces = [fsf_piece("king", "k"), fsf_piece("custom1", "a", custom_betza="BN")]
        info = make_fsf_variant_info(name="resolvedbetza", pieces=pieces)
        diagrams = catalogued_betza_diagrams(
            {
                "name": "resolvedbetza",
                "ini": """
                [resolvedbetza:chess]
                customPiece1 = z:N
                """,
                "fsfVariantInfo": info,
            }
        )

        self.assertEqual([diagram["piece"] for diagram in diagrams], ["a"])
        self.assertEqual([diagram["betza"] for diagram in diagrams], ["BN"])
        self.assertIn("Custom piece 1", diagrams[0]["title"])

    def test_custom_king_with_betza_is_rendered_but_bare_king_is_ignored(self):
        with_custom_king = catalogued_betza_diagrams(
            {
                "ini": """
                [royaltest:chess]
                king = k:KN
                """,
            }
        )
        bare_king = catalogued_betza_diagrams(
            {
                "ini": """
                [normalking:chess]
                king = k
                """,
            }
        )

        self.assertEqual(len(with_custom_king), 1)
        self.assertEqual(with_custom_king[0]["piece"], "k")
        self.assertEqual(with_custom_king[0]["betza"], "KN")
        self.assertEqual(bare_king, [])

    def test_custom_piece_diagram_list_is_cached_by_ini_and_preview_size(self):
        doc = {
            "ini": """
            [cachetest:chess]
            customPiece1 = a:BN
            """,
            "width": 8,
            "height": 8,
        }

        with patch(
            "catalogued_betza._custom_piece_definitions",
            wraps=catalogued_betza._custom_piece_definitions,
        ) as definitions:
            first = catalogued_betza_diagrams(doc)
            second = catalogued_betza_diagrams(dict(doc))

        self.assertEqual(first, second)
        self.assertEqual(definitions.call_count, 1)


if __name__ == "__main__":
    unittest.main()
