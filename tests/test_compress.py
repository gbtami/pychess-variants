# -*- coding: utf-8 -*-

import string
import unittest

import pyffish as sf

from compress import encode_moves, decode_moves
from fairy import FairyBoard
from const import VARIANTS

sf.set_option("VariantPath", "variants.ini")


class EncodeDecodeTestCase(unittest.TestCase):

    def test_encode_decode(self):
        for idx, variant in enumerate(VARIANTS):
            print(idx, variant)
            variant = variant.rstrip("960")
            FEN = sf.start_fen(variant)
            # fill the pockets with possible pieces
            for empty_pocket in ("[]", "[-]"):
                if empty_pocket in FEN:
                    pocket = "".join([i for i in set(FEN.split()[0]) if i in string.ascii_letters and i not in "Kk"])
                    parts = FEN.split(empty_pocket)
                    FEN = "%s[%s]%s" % (parts[0], pocket, parts[1])
                # print(idx, variant, FEN)

            board = FairyBoard(variant, initial_fen=FEN)
            moves = board.legal_moves()

            saved_restored = decode_moves(encode_moves(moves, variant), variant)
            self.assertEqual(saved_restored, moves)


if __name__ == '__main__':
    unittest.main(verbosity=2)
