from __future__ import annotations

import unittest

from catalogued_betza import catalogued_betza_diagrams


class CataloguedBetzaDiagramTestCase(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
