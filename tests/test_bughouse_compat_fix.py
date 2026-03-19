import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import STARTED
from pychess_global_app_state_utils import get_app_state
from server import make_app
from views import add_game_context

test_logger.init_test_logger()


class BughouseContextTestCase(unittest.TestCase):
    def test_add_game_context_uses_bughouse_compat_fields(self) -> None:
        player_a = SimpleNamespace(username="whiteA", title="")
        player_b = SimpleNamespace(username="blackA", title="")
        player_c = SimpleNamespace(username="whiteB", title="")
        player_d = SimpleNamespace(username="blackB", title="")

        class FakeBughouseGame:
            id = "bug1"
            variant = "bughouse"
            wplayer = player_a
            bplayer = player_b
            wplayerB = player_c
            bplayerB = player_d
            wrating = "1500"
            brating = "1500"
            wrating_b = "1500"
            brating_b = "1500"
            wrdiff = 0
            brdiff = 0
            chess960 = True
            rated = 0
            corr = False
            level = 0
            fen = "fen-a | fen-b"
            posnum = -1
            base = 3
            inc = 2
            byoyomi_period = 0
            result = "*"
            status = STARTED + 1
            date = datetime(2026, 3, 19, tzinfo=timezone.utc)
            browser_title = "Bughouse"
            ply = 4
            initial_fen = "start-a | start-b"
            server_variant = SimpleNamespace(two_boards=True)

            @property
            def board(self) -> object:
                raise AssertionError("bughouse context should not access game.board")

            def get_board(
                self, full: bool = False, persp_color: int | None = None
            ) -> dict[str, object]:
                return {"type": "board", "full": full, "persp": persp_color}

        context: dict[str, object] = {}
        add_game_context(FakeBughouseGame(), None, SimpleNamespace(username="spectator"), context)

        self.assertEqual(context["posnum"], -1)
        self.assertEqual(context["fen"], "fen-a | fen-b")
        self.assertEqual(context["initialFen"], "start-a | start-b")
        self.assertEqual(context["wplayerB"], "whiteB")
        self.assertEqual(context["bplayerB"], "blackB")


class GamesApiBughousePreviewTestCase(AioHTTPTestCase):
    async def startup(self, app) -> None:
        app_state = get_app_state(self.app)

        class FakeBughouseGame:
            id = "bug1"
            variant = "bughouse"
            chess960 = False
            base = 3
            inc = 0
            byoyomi_period = 0
            level = 0
            corr = False
            status = STARTED
            lastmove = None
            turn_player = "whiteA"
            preview_fen = "fen-a"
            wplayer = SimpleNamespace(username="whiteA", title="")
            bplayer = SimpleNamespace(username="blackA", title="")
            spectators: set[object] = set()
            non_bot_players: list[object] = []

            @property
            def board(self) -> object:
                raise AssertionError("bughouse preview should not access game.board")

        app_state.games["bug1"] = FakeBughouseGame()

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self) -> None:
        await self.client.close()

    async def test_api_games_uses_preview_fen(self) -> None:
        response = await self.client.get("/api/games")
        self.assertEqual(response.status, 200)
        payload = await response.json()

        self.assertEqual(payload[0]["gameId"], "bug1")
        self.assertEqual(payload[0]["fen"], "fen-a")


if __name__ == "__main__":
    unittest.main(verbosity=2)
