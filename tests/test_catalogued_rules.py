import unittest

from catalogued_rules import catalogued_rule_summary, parse_catalogued_ini


class CataloguedRulesTestCase(unittest.TestCase):
    def test_parse_parent_and_options(self):
        parsed = parse_catalogued_ini(
            """
            [coffeehouse:crazyhouse]
            mustCapture = true
            pieceDrops = true # comment
            """
        )

        self.assertEqual(parsed.name, "coffeehouse")
        self.assertEqual(parsed.parent, "crazyhouse")
        self.assertEqual(parsed.option("mustCapture"), "true")
        self.assertEqual(parsed.option("pieceDrops"), "true")

    def test_catalogued_rule_summary_groups_common_rules(self):
        summary = catalogued_rule_summary(
            {
                "name": "coffeehouse",
                "ini": """
                [coffeehouse:crazyhouse]
                mustCapture = true
                pieceDrops = true
                capturesToHand = true
                dropNoDoubled = p
                promotionRegionWhite = *8
                promotionPieceTypes = qrn
                """,
                "startFen": "8/8/8/8/8/8/8/8[] w - - 0 1",
                "width": 8,
                "height": 8,
                "pieces": ["k", "q", "r", "b", "n", "p"],
                "pocketRoles": ["q", "r", "b", "n", "p"],
                "promotionRoles": ["p"],
                "captureToHand": True,
            }
        )

        section_titles = [section["title"] for section in summary["sections"]]
        self.assertIn("Move rules", section_titles)
        self.assertIn("Drops and hands", section_titles)
        self.assertIn("Promotion", section_titles)
        self.assertEqual(summary["unknown"], [])

    def test_generated_text_does_not_need_raw_ini_echo(self):
        summary = catalogued_rule_summary(
            {
                "ini": """
                [gomoku:chess]
                connectN = 5
                promotedPieceType = o:k
                """,
            }
        )

        all_text = "\n".join(
            line["text"] for section in summary["sections"] for line in section["lines"]
        )
        self.assertIn("A player can win by connecting 5 pieces", all_text)
        self.assertIn("Fixed promotion mappings: o promotes to k.", all_text)
        self.assertNotIn("connectN = 5", all_text)
        self.assertNotIn("promotedPieceType = o:k", all_text)

    def test_wildcard_rank_promotion_region_is_described(self):
        summary = catalogued_rule_summary(
            {
                "ini": """
                [widepromotion:chess]
                promotionRegion = white: *1 *2 *3 *4 *5 *6 *7 *8 *9, black: *9 *8 *7 *6 *5 *4 *3 *2 *1
                """,
            }
        )

        all_text = "\n".join(
            line["text"] for section in summary["sections"] for line in section["lines"]
        )
        self.assertIn("Promotions are available in the configured promotion zones.", all_text)
        self.assertIn("the promotion region for White is all the ranks from 1 to 9", all_text)
        self.assertIn("the promotion region for Black is all the ranks from 9 to 1", all_text)

    def test_board_setup_uses_visual_preview_instead_of_fen_sentences(self):
        summary = catalogued_rule_summary(
            {
                "ini": """
                [visualsetup:chess]
                """,
                "startFen": "8/8/8/8/8/8/8/K6k w - - 0 1",
                "width": 8,
                "height": 8,
            }
        )

        board_section = next(
            section for section in summary["sections"] if section["title"] == "Board and setup"
        )
        self.assertEqual(board_section.get("kind"), "boardSetup")
        all_text = "\n".join(
            line["text"] for section in summary["sections"] for line in section["lines"]
        )
        self.assertNotIn("The board is", all_text)
        self.assertNotIn("starting position is defined", all_text)


if __name__ == "__main__":
    unittest.main()
