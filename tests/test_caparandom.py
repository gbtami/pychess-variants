import unittest
from unittest.mock import patch

from fairy.caparandom import (
    CAPARANDOM_VALID_IDS,
    caparandom_id_from_rank8,
    caparandom_rank8,
    caparandom_rank8_from_id,
)

_PAWN_PROTECTION_OFFSETS = {
    "k": (-1, 0, 1),
    "q": (-1, 0, 1),
    "r": (0,),
    "b": (-1, 1),
    "n": (-2, 2),
    "c": (-2, 0, 2),
    "a": (-2, -1, 1, 2),
}


def _all_pawns_protected(rank8: str) -> bool:
    protected = [False] * 10
    for piece_pos, piece in enumerate(rank8):
        for offset in _PAWN_PROTECTION_OFFSETS[piece]:
            pawn_pos = piece_pos + offset
            if 0 <= pawn_pos < 10:
                protected[pawn_pos] = True
    return all(protected)


def _bishops_not_adjacent(rank8: str) -> bool:
    left = rank8.index("b")
    right = rank8.rindex("b")
    return right - left != 1


class TestCaparandom(unittest.TestCase):
    def test_scharnagl_reference_positions(self):
        # Reinhard Scharnagl's published CRC reference-code output.
        reference = (
            "aqbbcnnrkr",
            "qbbacnnrkr",
            "abbqcnnrkr",
            "qbbcnanrkr",
            "abbcnqnrkr",
            "qbbcnnrakr",
            "abbcnnrqkr",
            "qbbcnnrkra",
            "abbcnnrkrq",
            "baqbcnnrkr",
            "bqabcnnrkr",
            "bbqacnnrkr",
            "bbaqcnnrkr",
            "bbqcnanrkr",
            "bbacnqnrkr",
            "bbqcnnrakr",
            "bbacnnrqkr",
            "bbqcnnrkra",
            "bbacnnrkrq",
            "bacbqnnrkr",
            "bqcbannrkr",
            "bbcaqnnrkr",
            "bbcqannrkr",
            "bbcnqanrkr",
            "bbcnaqnrkr",
            "bbcnqnrakr",
            "bbcnanrqkr",
            "bbcnqnrkra",
            "bbcnanrkrq",
            "bacbnnqrkr",
            "bqcbnnarkr",
            "bbcannqrkr",
        )
        for position_id, expected_rank8 in enumerate(reference, start=1):
            with self.subTest(position_id=position_id):
                self.assertEqual(caparandom_rank8_from_id(position_id), expected_rank8)
                self.assertEqual(caparandom_id_from_rank8(expected_rank8), position_id)

    def test_all_position_ids_round_trip_and_valid_id_list_is_complete(self):
        expected_valid_ids = []
        seen_ranks = set()

        for position_id in range(1, 48_001):
            rank8 = caparandom_rank8_from_id(position_id)
            self.assertEqual(caparandom_id_from_rank8(rank8), position_id)
            seen_ranks.add(rank8)

            if _all_pawns_protected(rank8) and _bishops_not_adjacent(rank8):
                expected_valid_ids.append(position_id)

        self.assertEqual(len(seen_ranks), 48_000)
        self.assertEqual(len(expected_valid_ids), 12_130)
        self.assertEqual(CAPARANDOM_VALID_IDS, tuple(expected_valid_ids))

    def test_position_48000_is_the_wrapped_zero_value(self):
        self.assertEqual(caparandom_rank8_from_id(48_000), "qabbcnnrkr")
        self.assertEqual(caparandom_id_from_rank8("QABBCNNRKR"), 48_000)

    def test_random_generation_uses_only_valid_ids(self):
        position_id = CAPARANDOM_VALID_IDS[1234]
        with patch("fairy.caparandom.random.choice", return_value=position_id) as choice:
            self.assertEqual(caparandom_rank8(), caparandom_rank8_from_id(position_id))
        choice.assert_called_once_with(CAPARANDOM_VALID_IDS)

    def test_invalid_position_id_is_rejected(self):
        for position_id in (0, 48_001):
            with self.subTest(position_id=position_id), self.assertRaises(ValueError):
                caparandom_rank8_from_id(position_id)

    def test_invalid_back_rank_is_rejected(self):
        invalid_ranks = (
            "rnbqkbnr",  # wrong board width/piece set
            "qabbbnnrkr",  # wrong piece set
            "qabbcnnrkr".replace("a", "q"),  # no archbishop
            "qabcbnnrkr",  # bishops on the same color
            "qabbcnnrrk",  # king is not between the rooks
        )
        for rank8 in invalid_ranks:
            with self.subTest(rank8=rank8), self.assertRaises(ValueError):
                caparandom_id_from_rank8(rank8)


if __name__ == "__main__":
    unittest.main()
