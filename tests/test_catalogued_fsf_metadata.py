from __future__ import annotations

from unittest import TestCase

from catalogued_variants import (
    FSF_CATALOGUED_BUILTIN_VARIANTS,
    FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES,
    FSF_CATALOGUED_RETIRED_BUILTIN_VARIANTS,
)


class FsfBuiltinMetadataTestCase(TestCase):
    def test_engine_and_client_variant_relationships_are_separate(self) -> None:
        expected = {
            "atomar": ("nocheckatomic", "atomic"),
            "centaur": ("", "capablanca"),
            "chancellor": ("", "capablanca"),
            "codrus": ("giveaway", "antichess"),
            "courier": ("", "shatranj"),
            "georgian": ("amazon", "chess"),
            "giveaway": ("", "antichess"),
            "janus": ("", "capablanca"),
            "kinglet": ("extinction", "chess"),
            "losers": ("", "antichess"),
            "modern": ("", "capablanca"),
            "nocheckatomic": ("", "atomic"),
            "petrified": ("pawnsideways", "chess"),
            "shatar": ("", "shatranj"),
            "tencubed": ("", "grand"),
            "yarishogi": ("", "shogi"),
            "almost": ("", "chess"),
            "gustav3": ("", "chess"),
            "omicron": ("", "chess"),
            "troitzky": ("", "chess"),
        }

        for name, (base_variant, client_variant) in expected.items():
            with self.subTest(name=name):
                metadata = FSF_CATALOGUED_BUILTIN_VARIANTS[name]
                self.assertEqual(metadata["baseVariant"], base_variant)
                self.assertEqual(metadata["clientVariant"], client_variant)

    def test_candidate_relationships_do_not_invent_engine_parents(self) -> None:
        expected = {
            "chessgi": ("loop", "crazyhouse"),
            "euroshogi": ("", "shogi"),
            "gorogoro": ("", "shogi"),
            "judkins": ("", "shogi"),
            "mini": ("", "minishogi"),
            "okisakishogi": ("", "shogi"),
        }

        for name, (base_variant, client_variant) in expected.items():
            with self.subTest(name=name):
                metadata = FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES[name]
                self.assertEqual(metadata["baseVariant"], base_variant)
                self.assertEqual(metadata["clientVariant"], client_variant)

        self.assertEqual(
            FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES["micro"]["baseVariant"],
            "kyotoshogi",
        )
        self.assertNotIn("clientVariant", FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES["micro"])
        self.assertEqual(FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES["normal"]["baseVariant"], "")
        self.assertEqual(
            FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES["normal"]["clientVariant"],
            "chess",
        )

    def test_chigorin_is_not_seeded_until_side_specific_promotions_are_supported(self) -> None:
        self.assertNotIn("chigorin", FSF_CATALOGUED_BUILTIN_VARIANTS)
        self.assertIn("chigorin", FSF_CATALOGUED_BUILTIN_VARIANTS_CANDIDATES)
        self.assertIn("chigorin", FSF_CATALOGUED_RETIRED_BUILTIN_VARIANTS)

    def test_premove_profile_can_be_narrower_than_general_client_profile(self) -> None:
        for name in ("omicron", "troitzky"):
            metadata = FSF_CATALOGUED_BUILTIN_VARIANTS[name]
            self.assertEqual(metadata["clientVariant"], "chess")
            self.assertEqual(metadata["premoveVariant"], "grand")

    def test_gustav_and_omicron_promotion_targets_include_fairy_pieces(self) -> None:
        gustav = FSF_CATALOGUED_BUILTIN_VARIANTS["gustav3"]
        self.assertEqual(gustav["promotionRoles"], ("p",))
        self.assertEqual(gustav["promotionOrder"], ("a", "q", "r", "b", "n"))

        omicron = FSF_CATALOGUED_BUILTIN_VARIANTS["omicron"]
        self.assertEqual(omicron["promotionRoles"], ("p",))
        self.assertEqual(omicron["promotionOrder"], ("w", "c", "q", "r", "b", "n"))
