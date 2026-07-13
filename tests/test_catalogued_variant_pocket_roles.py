import unittest

from fsf_variant_info import derive_catalogued_variant_info
from fsf_variant_info_fixture import fsf_piece, make_fsf_variant_info


COURTHRONE_START_FEN = "qpbdkdbpq/9/v1v1v1v1v/9/9/9/V1V1V1V1V/9/QPBDKDBPQ[NNTTnntt] w - - 0 1"
COURTHRONE_PIECES = [
    fsf_piece("queen", "q"),
    fsf_piece("custom4", "b", custom_betza="cQmpQ"),
    fsf_piece("custom2", "p", custom_betza="pQ"),
    fsf_piece("custom3", "d", custom_betza="mQcpQ"),
    fsf_piece("custom1", "v", custom_betza="fFfsW"),
    fsf_piece("knight", "n"),
    fsf_piece("custom6", "t", custom_betza="AD"),
    fsf_piece("king", "k"),
]


class CataloguedVariantPocketRolesTestCase(unittest.TestCase):
    def _info(self):
        info = make_fsf_variant_info(
            name="courthrone",
            template="shogi",
            start_fen=COURTHRONE_START_FEN,
            width=9,
            height=9,
            pieces=COURTHRONE_PIECES,
        )
        info["drops"]["enabled"] = True
        return info

    def test_capture_to_hand_expands_initial_pocket_to_all_non_royal_pieces(self):
        info = self._info()
        info["drops"]["capturesToHand"] = True

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.pocket_roles, ["n", "t", "q", "b", "p", "d", "v"])

    def test_non_capture_to_hand_keeps_explicit_initial_pocket_roles(self):
        info = self._info()
        info["drops"]["capturesToHand"] = False

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.pocket_roles, ["n", "t"])

    def test_inherited_drops_without_fen_pocket_use_resolved_variant_piece_set(self):
        info = make_fsf_variant_info(
            template="shogi",
            start_fen="4k4/9/9/9/9/9/9/9/4K3P w - - 0 1",
            width=9,
            height=9,
            pieces=[fsf_piece("shogiPawn", "p"), fsf_piece("king", "k")],
        )
        info["drops"].update({"enabled": True, "capturesToHand": True})

        derived = derive_catalogued_variant_info(info)

        self.assertEqual(derived.pocket_roles, ["p"])
        self.assertTrue(derived.capture_to_hand)


if __name__ == "__main__":
    unittest.main()
