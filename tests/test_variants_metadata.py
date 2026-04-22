import unittest

from variants import ServerVariants


class VariantMetadataTestCase(unittest.TestCase):
    def test_fogofwar_hidden_info_metadata(self):
        self.assertTrue(ServerVariants.FOGOFWAR.hidden_info)
        self.assertEqual(ServerVariants.FOGOFWAR.hidden_info_mode, "fog")

    def test_jieqi_hidden_info_metadata(self):
        self.assertTrue(ServerVariants.JIEQI.hidden_info)
        self.assertEqual(ServerVariants.JIEQI.hidden_info_mode, "covered_pieces")

    def test_chess_hidden_info_metadata_defaults(self):
        self.assertFalse(ServerVariants.CHESS.hidden_info)
        self.assertEqual(ServerVariants.CHESS.hidden_info_mode, "none")


if __name__ == "__main__":
    unittest.main(verbosity=2)
