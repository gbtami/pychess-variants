from __future__ import annotations

import unittest
from unittest.mock import patch

import catalogued_betza
from catalogued_betza import catalogued_betza_diagrams


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

    def test_documentation_ini_generates_diagrams_without_runtime_ini(self):
        diagrams = catalogued_betza_diagrams(
            {
                "ini": "",
                "rulesIni": """
                [documented:shogi]
                customPiece1 = n:fRffN
                customPiece2 = g:WfFbR
                """,
                "width": 7,
                "height": 9,
            }
        )

        self.assertEqual([diagram["piece"] for diagram in diagrams], ["n", "g"])
        self.assertEqual([diagram["betza"] for diagram in diagrams], ["fRffN", "WfFbR"])

    def test_explicit_piece_name_replaces_custom_piece_fallback(self):
        diagrams = catalogued_betza_diagrams(
            {
                "ini": """
                [namedpiece:chess]
                customPiece1 = z:WAD
                """,
                "pieceNames": {"z": "Zebra"},
            }
        )

        self.assertEqual(diagrams[0]["title"], "Zebra (Z) movement")

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
