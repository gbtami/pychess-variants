import unittest

import test_logger

from compress import encode_move_standard
from utils import _encode_import_moves

test_logger.init_test_logger()


class ImportGameMoveEncodingTestCase(unittest.TestCase):
    def test_ignores_extra_whitespace(self):
        moves, error = _encode_import_moves(
            "e2e4   e7e5  ",
            move_encoding=encode_move_standard,
            grand_variant=False,
        )
        self.assertIsNone(error)
        self.assertEqual(len(moves), 2)

    def test_rejects_invalid_standard_move(self):
        moves, error = _encode_import_moves(
            "e2e4 bad",
            move_encoding=encode_move_standard,
            grand_variant=False,
        )
        self.assertEqual(moves, [])
        self.assertEqual(error, "Invalid move 'bad' at ply 2 in imported PGN.")

    def test_rejects_invalid_grand_move(self):
        moves, error = _encode_import_moves(
            "a10a9 a",
            move_encoding=encode_move_standard,
            grand_variant=True,
        )
        self.assertEqual(moves, [])
        self.assertEqual(error, "Invalid move 'a' at ply 2 in imported PGN.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
