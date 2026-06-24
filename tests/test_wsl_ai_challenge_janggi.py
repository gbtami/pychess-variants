import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import test_logger

from wsl import handle_accept_seek, handle_create_ai_challenge


test_logger.init_test_logger()


class DummyUser:
    def __init__(self, username: str) -> None:
        self.username = username
        self.anon = False
        self.bot = False
        self.title = ""
        self.game_in_progress = None

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
    async def test_unsupported_variant_forces_random_mover(self):
        fairy_engine = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=AsyncMock()),
            game_queues={},
            active_game_streams=set(),
        )
        random_mover = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=AsyncMock()),
            game_queues={},
            active_game_streams=set(),
        )
        app_state = SimpleNamespace(
            users={"Fairy-Stockfish": fairy_engine, "Random-Mover": random_mover},
            games={"g1": SimpleNamespace(id="g1", variant="jieqi", game_start={"type": "gs"})},
            db=None,
        )
        seek_ctor = Mock(return_value=object())
        join_seek = AsyncMock(return_value={"type": "new_game", "gameId": "g1"})

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch("wsl.new_id", new=AsyncMock(return_value="seek1")),
            patch("wsl.ws_send_json", new=AsyncMock()),
            patch("wsl.join_seek", new=join_seek),
            patch("wsl.Seek", new=seek_ctor),
        ):
            await handle_create_ai_challenge(
                app_state, object(), DummyUser("tester"), create_ai_payload("jieqi")
            )

        join_seek.assert_awaited_once()
        self.assertIs(join_seek.await_args.args[1], random_mover)
        self.assertEqual(seek_ctor.call_args.kwargs["level"], 0)

    async def test_janggi_pending_setup_does_not_start_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
            active_game_streams=set(),
        )
        game = SimpleNamespace(
            id="g1", variant="janggi", bsetup=True, wsetup=False, game_start={"type": "gs"}
        )
        app_state = SimpleNamespace(
            users={"Fairy-Stockfish": engine, "Random-Mover": engine},
            games={"g1": game},
            db=None,
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch("wsl.new_id", new=AsyncMock(return_value="seek1")),
            patch("wsl.ws_send_json", new=AsyncMock()),
            patch(
                "wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})
            ),
            patch("wsl.Seek", return_value=object()),
        ):
            await handle_create_ai_challenge(
                app_state, object(), DummyUser("tester"), create_ai_payload()
            )

        self.assertIn("g1", engine.game_queues)
        bot_put.assert_not_awaited()

    async def test_janggi_after_setup_starts_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
            active_game_streams=set(),
        )
        game = SimpleNamespace(
            id="g1", variant="janggi", bsetup=False, wsetup=False, game_start={"type": "gs"}
        )
        app_state = SimpleNamespace(
            users={"Fairy-Stockfish": engine, "Random-Mover": engine},
            games={"g1": game},
            db=None,
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch("wsl.new_id", new=AsyncMock(return_value="seek1")),
            patch("wsl.ws_send_json", new=AsyncMock()),
            patch(
                "wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})
            ),
            patch("wsl.Seek", return_value=object()),
        ):
            await handle_create_ai_challenge(
                app_state, object(), DummyUser("tester"), create_ai_payload()
            )

        bot_put.assert_awaited_once_with(game.game_start)

    async def test_accept_seek_janggi_pending_setup_does_not_start_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            bot=True,
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
            active_game_streams=set(),
        )
        seek = SimpleNamespace(
            id="seek1",
            creator=engine,
            variant="janggi",
            chess960=False,
            target="bot",
        )
        game = SimpleNamespace(
            id="g1", variant="janggi", bsetup=True, wsetup=False, game_start={"type": "gs"}
        )
        app_state = SimpleNamespace(
            seeks={"seek1": seek},
            games={"g1": game},
            lobby=SimpleNamespace(lobby_broadcast_seeks=AsyncMock()),
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch(
                "wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})
            ),
            patch("wsl.ws_send_json", new=AsyncMock()),
        ):
            await handle_accept_seek(
                app_state,
                object(),
                DummyUser("tester"),
                {"type": "accept_seek", "seekID": "seek1"},
            )

        self.assertIn("g1", engine.game_queues)
        bot_put.assert_not_awaited()

    async def test_accept_seek_janggi_after_setup_starts_bot(self):
        bot_put = AsyncMock()
        engine = SimpleNamespace(
            bot=True,
            online=True,
            event_queue=SimpleNamespace(put=bot_put),
            game_queues={},
            active_game_streams=set(),
        )
        seek = SimpleNamespace(
            id="seek1",
            creator=engine,
            variant="janggi",
            chess960=False,
            target="bot",
        )
        game = SimpleNamespace(
            id="g1", variant="janggi", bsetup=False, wsetup=False, game_start={"type": "gs"}
        )
        app_state = SimpleNamespace(
            seeks={"seek1": seek},
            games={"g1": game},
            lobby=SimpleNamespace(lobby_broadcast_seeks=AsyncMock()),
        )

        with (
            patch("wsl.send_game_in_progress_if_any", new=AsyncMock(return_value=False)),
            patch(
                "wsl.join_seek", new=AsyncMock(return_value={"type": "new_game", "gameId": "g1"})
            ),
            patch("wsl.ws_send_json", new=AsyncMock()),
        ):
            await handle_accept_seek(
                app_state,
                object(),
                DummyUser("tester"),
                {"type": "accept_seek", "seekID": "seek1"},
            )

        bot_put.assert_awaited_once_with(game.game_start)


if __name__ == "__main__":
    unittest.main(verbosity=2)
