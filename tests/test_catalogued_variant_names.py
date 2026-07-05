import unittest

from aiohttp import web

import test_logger
from catalogued_variants import extract_variant_name, replace_variant_section_name

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
