import unittest
from unittest.mock import AsyncMock

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import FLAG, STARTED
from game import Game
from glicko2.glicko2 import DEFAULT_PERF
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsr import handle_abort_resign_abandon_flag


PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


class FlagClaimValidationTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.wplayer = User(app_state, username="wplayer-flag", perfs=PERFS)
        self.bplayer = User(app_state, username="bplayer-flag", perfs=PERFS)

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def new_game(self) -> Game:
        return Game(
            get_app_state(self.app),
            id8(),
            "chess",
            "",
            self.wplayer,
            self.bplayer,
            rated=False,
        )

    async def play_white_first_move(self, game: Game) -> None:
        clocks = (game.clocks_w[0], game.clocks_b[0])
        await game.play_move("e2e4", clocks=clocks, ply=1)

    async def play_two_plies(self, game: Game) -> None:
        await self.play_white_first_move(game)
        clocks = (game.clocks_w[-1], game.clocks_b[-1])
        await game.play_move("e7e5", clocks=clocks, ply=2)

    async def test_flag_ignored_if_not_side_to_move(self):
        game = self.new_game()
        await self.play_two_plies(game)

        ws = AsyncMock()
        await handle_abort_resign_abandon_flag(
            ws,
            users={},
            user=self.bplayer,
            data={"type": "flag", "gameId": game.id},
            game=game,
        )

        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        ws.send_json.assert_not_awaited()

    async def test_flag_ignored_before_server_timeout(self):
        game = self.new_game()
        await self.play_two_plies(game)

        ws = AsyncMock()
        await handle_abort_resign_abandon_flag(
            ws,
            users={},
            user=self.wplayer,
            data={"type": "flag", "gameId": game.id},
            game=game,
        )

        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        ws.send_json.assert_not_awaited()

    async def test_flag_accepted_when_server_clock_is_expired(self):
        game = self.new_game()
        await self.play_two_plies(game)

        # Force white's server-side remaining time to be negative.
        game.last_server_clock -= (game.clocks_w[-1] / 1000) + 1

        ws = AsyncMock()
        await handle_abort_resign_abandon_flag(
            ws,
            users={},
            user=self.wplayer,
            data={"type": "flag", "gameId": game.id},
            game=game,
        )

        self.assertEqual(game.status, FLAG)
        self.assertEqual(game.result, "0-1")
        ws.send_json.assert_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
