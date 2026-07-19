from __future__ import annotations

from unittest import TestCase

import catalogued_board
from catalogued_board import catalogued_start_board_preview


class CataloguedStartBoardPreviewTestCase(TestCase):
    def setUp(self) -> None:
        catalogued_board._cached_start_board_svg.cache_clear()

    def test_start_board_preview_renders_fen_as_inline_svg(self) -> None:
        preview = catalogued_start_board_preview(
            {
                "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "width": 8,
                "height": 8,
            }
        )

        self.assertIsNotNone(preview)
        assert preview is not None
        self.assertEqual(preview["width"], 8)
        self.assertEqual(preview["height"], 8)
        self.assertIn("<svg", preview["svg"])
        self.assertIn('width="192" height="192"', preview["svg"])
        self.assertEqual(preview["svg"].count("catalogued-start-board-square"), 64)
        self.assertIn("catalogued-start-board-piece-white", preview["svg"])
        self.assertIn("catalogued-start-board-piece-black", preview["svg"])

    def test_start_board_preview_handles_multi_digit_empty_counts_and_pockets(self) -> None:
        preview = catalogued_start_board_preview(
            {
                "startFen": "10/10/10/10/PPPPPPPPPP/RNBQKABNR1[pp] w - - 0 1",
                "width": 10,
                "height": 6,
            }
        )

        self.assertIsNotNone(preview)
        assert preview is not None
        self.assertEqual(preview["width"], 10)
        self.assertEqual(preview["height"], 6)
        self.assertEqual(preview["svg"].count("catalogued-start-board-square"), 60)

    def test_start_board_preview_marks_promoted_and_hidden_pieces(self) -> None:
        preview = catalogued_start_board_preview(
            {
                "startFen": "+P6/k~7/8/8/8/8/8/8 w - - 0 1",
                "width": 8,
                "height": 8,
            }
        )

        self.assertIsNotNone(preview)
        assert preview is not None
        self.assertIn("+P", preview["svg"])
        self.assertIn("catalogued-start-board-piece-promoted", preview["svg"])
        self.assertIn("catalogued-start-board-piece-hidden", preview["svg"])

    def test_start_board_preview_uses_brick_svg_for_wall_piece(self) -> None:
        preview = catalogued_start_board_preview(
            {
                "startFen": "8/8/3*4/8/8/8/8/8 w - - 0 1",
                "width": 8,
                "height": 8,
            }
        )

        self.assertIsNotNone(preview)
        assert preview is not None
        self.assertIn("catalogued-start-board-piece-wall", preview["svg"])
        self.assertIn('href="/static/images/pieces/brick.svg"', preview["svg"])
        self.assertNotIn(">*</text>", preview["svg"])


if __name__ == "__main__":
    import unittest

    unittest.main()
