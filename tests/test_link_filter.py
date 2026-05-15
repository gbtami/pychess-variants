import unittest

from link_filter import sanitize_user_message


class LinkFilterTestCase(unittest.TestCase):
    def test_fast_path_keeps_plain_text(self):
        text = "hello there, no links here"
        self.assertEqual(text, sanitize_user_message(text))

    def test_replaces_known_shortener(self):
        text = "check this https://tinyurl.com/abc123"
        self.assertEqual("check this [redacted]", sanitize_user_message(text))

    def test_strips_referral_token(self):
        text = "join chess.com/register?refId=MyRef123"
        self.assertEqual("join chess.com", sanitize_user_message(text))

    def test_redacts_sensitive_auth_path(self):
        text = "token https://pychess.org/auth/token/secret-value"
        self.assertEqual("token [redacted]", sanitize_user_message(text))


if __name__ == "__main__":
    unittest.main(verbosity=2)
