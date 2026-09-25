from __future__ import annotations

import unittest

from practice_goal import PracticeGoal, parse_practice_goal


class PracticeGoalParserTestCase(unittest.TestCase):
    def test_parses_lichess_compatible_goals(self) -> None:
        cases = {
            "mate": PracticeGoal("mate"),
            "checkmate": PracticeGoal("mate"),
            "mate in 5": PracticeGoal("mateIn", moves=5),
            "checkmate in 12": PracticeGoal("mateIn", moves=12),
            "draw in 20": PracticeGoal("drawIn", moves=20),
            "equal in 10": PracticeGoal("equalIn", moves=10),
            "equalize in 7": PracticeGoal("equalIn", moves=7),
            "+300cp in 8": PracticeGoal("evalIn", moves=8, cp=300),
            "-125cp in 3": PracticeGoal("evalIn", moves=3, cp=-125),
            "0cp in 0": PracticeGoal("evalIn", moves=0, cp=0),
            "promotion with +200cp": PracticeGoal("promotion", cp=200),
            "promotion with -50cp": PracticeGoal("promotion", cp=-50),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(parse_practice_goal(raw), expected)

    def test_parses_pychess_variant_native_win_goals(self) -> None:
        self.assertEqual(parse_practice_goal("win"), PracticeGoal("win"))
        self.assertEqual(parse_practice_goal("win in 9"), PracticeGoal("winIn", moves=9))

    def test_normalizes_case_and_whitespace(self) -> None:
        self.assertEqual(
            parse_practice_goal("  CHECKMATE\t IN   4  "),
            PracticeGoal("mateIn", moves=4),
        )
        self.assertEqual(
            parse_practice_goal("  ProMotion   WITH  -250CP "),
            PracticeGoal("promotion", cp=-250),
        )
        self.assertEqual(
            parse_practice_goal("  WiN   In  6 "),
            PracticeGoal("winIn", moves=6),
        )

    def test_rejects_missing_unknown_or_non_compatible_syntax(self) -> None:
        for raw in (
            None,
            "",
            "Normal",
            "mate eventually",
            "mate in -1",
            "draw in three",
            "equalise in 5",
            "+300 cp in 8",
            "promotion",
            "win by extinction",
            12,
        ):
            with self.subTest(raw=raw):
                self.assertIsNone(parse_practice_goal(raw))

    def test_rejects_values_outside_lichess_int_range(self) -> None:
        self.assertIsNone(parse_practice_goal("mate in 2147483648"))
        self.assertIsNone(parse_practice_goal("2147483648cp in 5"))
        self.assertIsNone(parse_practice_goal("promotion with -2147483649cp"))

    def test_payload_matches_practice_client_contract(self) -> None:
        self.assertEqual(PracticeGoal("mate").to_payload(), {"result": "mate"})
        self.assertEqual(
            PracticeGoal("evalIn", moves=8, cp=300).to_payload(),
            {"result": "evalIn", "moves": 8, "cp": 300},
        )
