# -*- coding: utf-8 -*-

import string
import unittest

from fairy import FairyBoard
from variants import get_server_variant, VARIANTS


class EncodeDecodeTestCase(unittest.TestCase):
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
