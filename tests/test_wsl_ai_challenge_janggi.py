import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger

from wsl import handle_create_ai_challenge


test_logger.init_test_logger()


class DummyUser:
    def __init__(self, username: str) -> None:
        self.username = username
        self.anon = False
        self.bot = False
        self.title = ""

    def get_rating_value(self, _variant: str, _chess960: bool | None) -> int:
        return 1500


def create_ai_payload(variant: str = "janggi") -> dict[str, object]:
    return {
        "type": "create_ai_challenge",
        "rm": False,
        "user": "tester",
        "variant": variant,
        "fen": "",
        "minutes": 5,
        "increment": 3,
        "byoyomiPeriod": 1,
        "rated": False,
        "level": 2,
        "chess960": False,
        "color": "b",
        "profileid": "Fairy-Stockfish",
    }


class WslCreateAiChallengeJanggiTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_janggi_pending_setup_does_not_start_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
        )
        game = SimpleNamespace(variant="janggi", bsetup=True, wsetup=False, game_start={"type": "gs"})
        app_state = SimpleNamespace(
            users={"Fairy-Stockfish": engine, "Random-Mover": engine},
            games={"g1": game},
            db=None,
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch("wsl.new_id", new=AsyncMock(return_value="seek1")),
            patch("wsl.ws_send_json", new=AsyncMock()),
            patch("wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})),
            patch("wsl.Seek", return_value=object()),
        ):
            await handle_create_ai_challenge(app_state, object(), DummyUser("tester"), create_ai_payload())

        self.assertIn("g1", engine.game_queues)
        bot_put.assert_not_awaited()

    async def test_janggi_after_setup_starts_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
        )
        game = SimpleNamespace(variant="janggi", bsetup=False, wsetup=False, game_start={"type": "gs"})
        app_state = SimpleNamespace(
            users={"Fairy-Stockfish": engine, "Random-Mover": engine},
            games={"g1": game},
            db=None,
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch("wsl.new_id", new=AsyncMock(return_value="seek1")),
            patch("wsl.ws_send_json", new=AsyncMock()),
            patch("wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})),
            patch("wsl.Seek", return_value=object()),
        ):
            await handle_create_ai_challenge(app_state, object(), DummyUser("tester"), create_ai_payload())

        bot_put.assert_awaited_once_with(game.game_start)


if __name__ == "__main__":
    unittest.main(verbosity=2)
