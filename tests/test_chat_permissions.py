import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import cast

from chat_permissions import lobby_chat_eligible
from user import User


def make_user(
    *,
    now: datetime,
    age: timedelta = timedelta(days=2),
    games: int = 10,
    perfs: dict[str, dict[str, int]] | None = None,
    anon: bool = False,
) -> User:
    return cast(
        User,
        SimpleNamespace(
            anon=anon,
            created_at=now - age,
            count={"game": games},
            perfs=perfs if perfs is not None else {"atomic": {"nb": 5}},
        ),
    )


class LobbyChatEligibilityTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)

    def test_account_at_all_thresholds_is_eligible(self) -> None:
        user = make_user(
            now=self.now,
            age=timedelta(hours=24),
            games=10,
            perfs={"chess": {"nb": 100}, "chess960": {"nb": 2}, "atomic": {"nb": 3}},
        )

        self.assertTrue(lobby_chat_eligible(user, now=self.now))

    def test_standard_chess_games_do_not_count_as_variant_games(self) -> None:
        user = make_user(
            now=self.now,
            perfs={"chess": {"nb": 100}, "atomic": {"nb": 4}},
        )

        self.assertFalse(lobby_chat_eligible(user, now=self.now))

    def test_new_account_is_not_eligible(self) -> None:
        user = make_user(now=self.now, age=timedelta(hours=23, minutes=59))

        self.assertFalse(lobby_chat_eligible(user, now=self.now))

    def test_account_with_too_few_completed_games_is_not_eligible(self) -> None:
        user = make_user(now=self.now, games=9)

        self.assertFalse(lobby_chat_eligible(user, now=self.now))

    def test_anonymous_user_is_not_eligible(self) -> None:
        user = make_user(now=self.now, anon=True)

        self.assertFalse(lobby_chat_eligible(user, now=self.now))


if __name__ == "__main__":
    unittest.main(verbosity=2)
