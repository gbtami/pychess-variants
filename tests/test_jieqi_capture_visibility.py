# -*- coding: utf-8 -*-

import unittest
import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from fairy import WHITE, BLACK
from game import Game
from glicko2.glicko2 import DEFAULT_PERF
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS

test_logger.init_test_logger()

PERFS = {"newplayer": {variant: DEFAULT_PERF for variant in VARIANTS}}
CLOCKS = [0, 0]


class JieqiCaptureVisibilityTestCase(AioHTTPTestCase):
    async def startup(self, app):
        # Use deterministic users so the test can focus on Jieqi capture behavior.
        self.wplayer = User(get_app_state(self.app), username="wplayer", perfs=PERFS["newplayer"])
        self.bplayer = User(get_app_state(self.app), username="bplayer", perfs=PERFS["newplayer"])

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_captured_fake_piece_identity_visible_to_capturer_only(self):
        # Minimal Jieqi position: red rook captures a covered black piece on a2.
        fen = "4k4/9/9/9/9/9/9/9/p~8/R3K4 w - - 0 1"
        game = Game(get_app_state(self.app), "12345678", "jieqi", fen, self.wplayer, self.bplayer)

        # The mapping represents the hidden identity under the cover at a2.
        game.board.jieqi_covered_pieces = {"a2": "n"}

        await game.play_move("a1a2", clocks=CLOCKS)

        capturer_view = game.get_board(full=True, persp_color=WHITE)
        opponent_view = game.get_board(full=True, persp_color=BLACK)
        spectator_view = game.get_board(full=True, persp_color=None)

        capturer_san = capturer_view["steps"][-1]["san"]
        opponent_san = opponent_view["steps"][-1]["san"]
        spectator_san = spectator_view["steps"][-1]["san"]

        # Captured fake identities must never appear in SAN.
        self.assertNotIn("=n", capturer_san)
        self.assertNotIn("=n", opponent_san)
        self.assertNotIn("=n", spectator_san)

        # Only the capturer should receive the hidden identity list.
        self.assertEqual(capturer_view.get("jieqiCaptures"), ["n"])
        self.assertEqual(opponent_view.get("jieqiCaptures"), [])
        self.assertIsNone(spectator_view.get("jieqiCaptures"))

        # The per-move stack mirrors the move list but only embeds the capturer's identity.
        self.assertEqual(capturer_view.get("jieqiCaptureStack"), ["n"])
        self.assertEqual(opponent_view.get("jieqiCaptureStack"), [None])
        self.assertIsNone(spectator_view.get("jieqiCaptureStack"))


if __name__ == "__main__":
    unittest.main()
