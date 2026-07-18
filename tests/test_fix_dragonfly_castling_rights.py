from __future__ import annotations

import unittest

from scripts.fix_dragonfly_castling_rights import (
    NEW_START_FEN,
    NEW_START_FEN_LINE,
    OLD_START_FEN,
    OLD_START_FEN_LINE,
    corrected_values,
)


class FixDragonflyCastlingRightsTestCase(unittest.TestCase):
    def test_builds_corrected_values(self) -> None:
        ini = f"[dragonfly:chess]\npieceDrops = true\n{OLD_START_FEN_LINE}"

        corrected = corrected_values({"ini": ini, "startFen": OLD_START_FEN})

        self.assertIsNotNone(corrected)
        corrected_ini, corrected_start_fen = corrected
        self.assertEqual(NEW_START_FEN, corrected_start_fen)
        self.assertIn(NEW_START_FEN_LINE, corrected_ini)
        self.assertNotIn(OLD_START_FEN_LINE, corrected_ini)

    def test_is_idempotent_when_already_fixed(self) -> None:
        ini = f"[dragonfly:chess]\n{NEW_START_FEN_LINE}"

        self.assertIsNone(corrected_values({"ini": ini, "startFen": NEW_START_FEN}))

    def test_refuses_unexpected_top_level_start_fen(self) -> None:
        ini = f"[dragonfly:chess]\n{OLD_START_FEN_LINE}"

        with self.assertRaisesRegex(RuntimeError, "Unexpected Dragonfly startFen"):
            corrected_values({"ini": ini, "startFen": "unexpected"})

    def test_refuses_ambiguous_ini(self) -> None:
        ini = f"[dragonfly:chess]\n{OLD_START_FEN_LINE}\n{OLD_START_FEN_LINE}"

        with self.assertRaisesRegex(RuntimeError, "Expected exactly one old Dragonfly"):
            corrected_values({"ini": ini, "startFen": OLD_START_FEN})


if __name__ == "__main__":
    unittest.main()
