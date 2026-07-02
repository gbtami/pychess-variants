# -*- coding: utf-8 -*-

import string
import unittest
import test_logger

from compress import (
    decode_move_extended,
    decode_move_standard,
    encode_move_extended,
    encode_move_standard,
)
from convert import grand2zero, zero2grand
from fairy import FairyBoard
from variants import (
    GRANDS,
    VARIANTS,
    get_server_variant,
    register_catalogued_server_variant,
    unregister_catalogued_server_variant,
)

test_logger.init_test_logger()


class EncodeDecodeTestCase(unittest.TestCase):
    def test_wide_board_square_encoding_roundtrip(self):
        moves = ["k1k2", "p9p8"]
        saved_restored = [*map(decode_move_standard, map(encode_move_standard, moves))]
        self.assertEqual(saved_restored, moves)

    def test_ten_rank_wide_board_move_encoding_roundtrip(self):
        moves = ["e10f7", "k10k9", "k1k10q"]
        saved_restored = [
            zero2grand(decode_move_standard(encode_move_standard(grand2zero(move))))
            for move in moves
        ]
        self.assertEqual(saved_restored, moves)

    def test_extended_board_move_encoding_roundtrip(self):
        moves = ["a11a12", "p16p15", "a16p1q", "Z@p16"]
        saved_restored = [*map(decode_move_extended, map(encode_move_extended, moves))]
        self.assertEqual(saved_restored, moves)

    def test_catalogued_extended_registration_uses_extended_codec(self):
        name = "testsixteen"
        unregister_catalogued_server_variant(name)
        try:
            variant = register_catalogued_server_variant(
                name, "Test Sixteen", extended_move_codec=True
            )
            self.assertFalse(variant.grand)
            self.assertNotIn(name, GRANDS)
            self.assertEqual(variant.move_decoding(variant.move_encoding("p16p15")), "p16p15")
        finally:
            unregister_catalogued_server_variant(name)
        self.assertNotIn(name, GRANDS)

    def test_catalogued_grand_registration_updates_runtime_grands(self):
        name = "testwidegrand"
        unregister_catalogued_server_variant(name)
        try:
            variant = register_catalogued_server_variant(name, "Test Wide Grand", grand=True)
            self.assertTrue(variant.grand)
            self.assertIn(name, GRANDS)
            self.assertTrue(get_server_variant(name, False).grand)
        finally:
            unregister_catalogued_server_variant(name)
        self.assertNotIn(name, GRANDS)

    def test_encode_decode(self):
        for idx, variant in enumerate(VARIANTS):
            print(idx, variant)
            if variant.endswith("960"):
                variant = variant.rstrip("960")
            FEN = FairyBoard.start_fen(variant)
            # fill the pockets with possible pieces
            for empty_pocket in ("[]", "[-]"):
                if empty_pocket in FEN:
                    pocket = "".join(
                        [
                            i
                            for i in set(FEN.split()[0])
                            if i in string.ascii_letters and i not in "Kk"
                        ]
                    )
                    parts = FEN.split(empty_pocket)
                    FEN = "%s[%s]%s" % (parts[0], pocket, parts[1])

            print(idx, variant, FEN)
            board = FairyBoard(variant, initial_fen=FEN)
            moves = board.legal_moves()

            server_variant = get_server_variant(variant, False)
            encode_method = server_variant.move_encoding
            decode_method = server_variant.move_decoding
            saved_restored = [*map(decode_method, map(encode_method, moves))]
            self.assertEqual(saved_restored, moves)


if __name__ == "__main__":
    unittest.main(verbosity=2)
