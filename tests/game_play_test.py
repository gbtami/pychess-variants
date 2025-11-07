import random
import unittest

from aiohttp.test_utils import AioHTTPTestCase

from mongomock_motor import AsyncMongoMockClient

from const import STARTED
from game import Game
from glicko2.glicko2 import DEFAULT_PERF
from newid import id8
from server import make_app
from user import User
from utils import insert_game_to_db
from pychess_global_app_state_utils import get_app_state
from variants import VARIANTS

DEFAULT_PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


class GamePlayTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.test_player = User(app_state, username="test_player", perfs=DEFAULT_PERFS)
        self.random_mover = app_state.users["Random-Mover"]

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def play_random(self, game):
        while game.status <= STARTED:
            move = random.choice(game.legal_moves)
            await game.play_move(move)

    async def test_game_play(self):
        """Playtest test_player vs Random-Mover"""
        app_state = get_app_state(self.app)
        for i, variant in enumerate(VARIANTS):
            print(i, variant)
            variant960 = variant.endswith("960")
            variant_name = variant[:-3] if variant960 else variant
            game_id = id8()
            if variant_name == "bughouse":
                pass
            else:
                game = Game(
                    app_state,
                    game_id,
                    variant_name,
                    "",
                    self.test_player,
                    self.random_mover,
                    rated=False,
                    chess960=variant960,
                    create=True,
                )
                app_state.games[game.id] = game
                await insert_game_to_db(game, app_state)
                self.random_mover.game_queues[game_id] = None
                await self.play_random(game)

                pgn = game.pgn
                self.assertIn(game.result, ("1-0", "0-1", "1/2-1/2"))
                pgn_result = pgn[pgn.rfind(" ") + 1 : -1]
                self.assertEqual(game.result, pgn_result)

            # await app_state.db.game.delete_one({"_id": game_id})


if __name__ == "__main__":
    unittest.main(verbosity=2)
