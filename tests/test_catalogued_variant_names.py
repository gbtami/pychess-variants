import unittest

from aiohttp import web

import test_logger
from catalogued_variants import (
    extract_variant_name,
    normalize_catalogued_display_name,
    replace_variant_section_name,
)

test_logger.init_test_logger()


class CataloguedVariantNameTestCase(unittest.TestCase):
    def test_extract_variant_name_accepts_hyphenated_fsf_alias(self) -> None:
        self.assertEqual("fsf-tencubed", extract_variant_name("[fsf-tencubed:tencubed]\n"))

    def test_replace_variant_section_name_preserves_parent_template(self) -> None:
        self.assertEqual(
            "[fsf-tencubed:tencubed]\n",
            replace_variant_section_name("[old_name:tencubed]\n", "fsf-tencubed"),
        )

    def test_rejects_name_that_does_not_start_with_lowercase_letter(self) -> None:
        with self.assertRaises(web.HTTPBadRequest):
            extract_variant_name("[-fsf-tencubed:tencubed]\n")

    def test_normalizes_repeated_display_name_separators(self) -> None:
        self.assertEqual(
            "Really-Fun_Name",
            normalize_catalogued_display_name("  Really---  Fun___Name  "),
        )
        self.assertEqual("A_B", normalize_catalogued_display_name("A_-_-_B"))

    def test_empty_display_name_uses_the_existing_fallback(self) -> None:
        self.assertEqual("", normalize_catalogued_display_name("   "))

    def test_accepts_natural_unicode_display_name_letters(self) -> None:
        for display_name in ("Misère Chess", "São Paulo Chess", "Шахматы 960"):
            with self.subTest(display_name=display_name):
                self.assertEqual(display_name, normalize_catalogued_display_name(display_name))

    def test_normalizes_compatibility_styled_display_name_characters(self) -> None:
        self.assertEqual("Chess 4", normalize_catalogued_display_name("𝗖𝗵𝗲𝘀𝘀 ４"))

    def test_accepts_meaningful_plain_text_punctuation(self) -> None:
        for display_name in (
            "Decimal Shogi (Will Be Archived)",
            "Guarded 0.5",
            "Hoppel-poppel++",
            "Trench Chess/Trench-house",
        ):
            with self.subTest(display_name=display_name):
                self.assertEqual(display_name, normalize_catalogued_display_name(display_name))

    def test_rejects_emoji_symbols_and_decorative_combining_marks(self) -> None:
        for display_name in ("Emoji 🎉 Chess", "Heart ♥ Chess", "C̸hess"):
            with self.subTest(display_name=display_name):
                with self.assertRaises(web.HTTPBadRequest):
                    normalize_catalogued_display_name(display_name)

    def test_rejects_display_name_with_separator_at_an_edge(self) -> None:
        for display_name in ("-Chess", "Chess_", "---"):
            with self.subTest(display_name=display_name):
                with self.assertRaises(web.HTTPBadRequest):
                    normalize_catalogued_display_name(display_name)

    def test_rejects_display_name_over_fifty_characters(self) -> None:
        with self.assertRaises(web.HTTPBadRequest):
            normalize_catalogued_display_name("A" * 51)
