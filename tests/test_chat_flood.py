import unittest

from chat_flood import ChatFlood, PASSLIST, similar_messages


class ChatFloodTestCase(unittest.TestCase):
    def test_blocks_duplicate_and_near_duplicate_messages(self) -> None:
        flood = ChatFlood()

        self.assertTrue(flood.allow_message("public:tester", "hello everyone", now=0.0))
        self.assertFalse(flood.allow_message("public:tester", "hello everyone", now=1.0))
        self.assertFalse(flood.allow_message("public:tester", "Hello  everyone", now=2.0))

    def test_allows_common_stock_messages(self) -> None:
        flood = ChatFlood()

        self.assertIn("Good game", PASSLIST)
        self.assertTrue(flood.allow_message("public:tester", "Good game", now=0.0))
        self.assertTrue(flood.allow_message("public:tester", "Good game", now=1.0))

    def test_blocks_message_burst(self) -> None:
        flood = ChatFlood()
        distinct_messages = [
            "alpha move",
            "banana tree",
            "castle queenside",
            "endgame study",
            "fork tactic",
        ]
        for idx, text in enumerate(distinct_messages):
            self.assertTrue(
                flood.allow_message("public:tester", text, now=float(idx)),
                msg=f"{text!r} should be accepted",
            )

        self.assertFalse(flood.allow_message("public:tester", "fresh topic", now=5.0))
        self.assertTrue(flood.allow_message("public:tester", "fresh topic", now=16.0))

    def test_similarity_ignores_case_and_whitespace(self) -> None:
        self.assertTrue(similar_messages("Hello there", "  hello   there "))
        self.assertFalse(similar_messages("hello there", "completely different"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
