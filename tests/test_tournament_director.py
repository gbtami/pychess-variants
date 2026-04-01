import unittest
from types import SimpleNamespace
from unittest.mock import patch

from tournament_director import is_tournament_director


class TournamentDirectorTestCase(unittest.TestCase):
    def test_explicit_director_is_allowed(self):
        user = SimpleNamespace(username="director")
        app_state = SimpleNamespace(anon_as_test_users=False)

        with patch("settings.TOURNAMENT_DIRECTORS", ["director"]):
            self.assertTrue(is_tournament_director(user, app_state))

    def test_dev_test_user_is_allowed_when_anon_promoted(self):
        user = SimpleNamespace(username="Test–abcd1234")
        app_state = SimpleNamespace(anon_as_test_users=True)

        with patch("settings.DEV", True), patch("settings.TOURNAMENT_DIRECTORS", []):
            self.assertTrue(is_tournament_director(user, app_state))

    def test_dev_test_user_is_rejected_without_anon_promotion(self):
        user = SimpleNamespace(username="Test–abcd1234")
        app_state = SimpleNamespace(anon_as_test_users=False)

        with patch("settings.DEV", True), patch("settings.TOURNAMENT_DIRECTORS", []):
            self.assertFalse(is_tournament_director(user, app_state))

    def test_regular_user_is_rejected(self):
        user = SimpleNamespace(username="regular")
        app_state = SimpleNamespace(anon_as_test_users=True)

        with patch("settings.DEV", True), patch("settings.TOURNAMENT_DIRECTORS", []):
            self.assertFalse(is_tournament_director(user, app_state))
