"""A move the engine refuses must resync its sender, not end the game.

WHY THIS TEST EXISTS, AND WHY IT IS IN PYTHON. The behaviour was changed in `utils_bug.play_move()`
and every automated test kept passing while a real illegal move still ended the game — because the
change was made in the wrong one of two handlers. `GameBug.play_move()` has its own `except` INSIDE
it, and it swallowed the exception and ended the game before the outer one could see anything. The
client's own tests cannot reach this: what the server does with a refused move is an INPUT to the
client's decisions, not one of them. Only a test that puts a real move through the real engine and
then asks the game what it thinks catches it.

Three things are asserted separately, because the fix had three halves and any could regress alone:
the game survives, the sender is handed the position, and NOTHING IS CHANGED ON THE WAY TO
REFUSING IT. The third was added after the first two shipped: `update_clocks()` ran before the move
was validated, so one refused move stopped a clock, overwrote the opponent's stored time with a
number the refusing client had sent, and appended a phantom entry to the clock record — damage that
used to die with the game and now persists, because the game continues.
"""

import unittest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from bug.game_bug import GameBug
from bug.utils_bug import play_move as play_move_bug
from const import INVALIDMOVE, STARTED
from glicko2.glicko2 import new_default_perf_map
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User
from variants import VARIANTS

from server import make_app

test_logger.init_test_logger()

CLOCKS = [60000, 60000]
ILLEGAL = "e2e5"  # not a legal first move for white, in any variant this game plays


class BughouseInvalidMoveTestCase(AioHTTPTestCase):
    async def startup(self, app):
        state = get_app_state(app)
        self.players = [
            User(state, username=name, perfs=new_default_perf_map(VARIANTS))
            for name in ("aw", "ab", "bw", "bb")
        ]

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def make_game(self) -> GameBug:
        aw, ab, bw, bb = self.players
        game = GameBug(
            get_app_state(self.app),
            "invalid1",
            "bughouse",
            "",
            aw,
            ab,
            bw,
            bb,
            rated=False,
        )
        game.date = datetime.now(UTC)
        return game

    async def test_the_game_survives_a_move_the_engine_refuses(self):
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()

        await play_move_bug(get_app_state(self.app), mover, game, ILLEGAL, CLOCKS, CLOCKS, "a")

        self.assertEqual(game.status, STARTED, "a refused move must not end the game")
        self.assertNotEqual(game.status, INVALIDMOVE)
        self.assertEqual(game.result, "*")

    async def test_nothing_is_recorded_for_a_move_the_engine_refuses(self):
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()

        await play_move_bug(get_app_state(self.app), mover, game, ILLEGAL, CLOCKS, CLOCKS, "a")

        played = [step.get("move") for step in game.steps if step.get("move")]
        self.assertEqual(played, [], "a refused move must leave no trace in the game")

    async def test_the_sender_is_handed_the_position(self):
        """The other half of the fix: refusing silently would leave that client stuck on a position
        the server does not hold, and it would send the same impossible move again on every
        reconnection."""
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()

        await play_move_bug(get_app_state(self.app), mover, game, ILLEGAL, CLOCKS, CLOCKS, "a")

        mover.send_game_message.assert_awaited()
        (game_id, message), _ = mover.send_game_message.await_args
        self.assertEqual(game_id, game.id)
        self.assertEqual(message["type"], "board")

    async def test_the_clocks_are_untouched_by_a_move_the_engine_refuses(self):
        """Refusing must cost nothing. Measured before the guard existed: one refused move left
        `ply_clocks` with three entries for a board holding one move, the opponent's stored clock
        replaced by the sender's number, and the board's stopwatch stopped and never restarted."""
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()
        clocks = game.gameClocks

        await play_move_bug(get_app_state(self.app), mover, game, "e2e4", CLOCKS, CLOCKS, "a")
        entries = len(clocks.ply_clocks["a"])
        stored = list(clocks.last_move_clocks["a"])
        running = clocks.stopwatches["a"].running

        # A LIE the refused move tells about every clock on the board.
        await play_move_bug(get_app_state(self.app), mover, game, ILLEGAL, [1, 1], [1, 1], "a")

        self.assertEqual(
            len(clocks.ply_clocks["a"]), entries, "a refused move must not lengthen the record"
        )
        self.assertEqual(
            list(clocks.last_move_clocks["a"]), stored, "a refused move must not restate a clock"
        )
        self.assertEqual(
            clocks.stopwatches["a"].running, running, "a refused move must not stop the clock"
        )

    async def test_the_partner_pocket_is_untouched_when_the_push_fails(self):
        """The capture is COMPUTED before the push and APPLIED after it.

        NOT REACHABLE THROUGH AN ILLEGAL MOVE ANY MORE, and that is why this test injects a
        failure instead. The guard now refuses an illegal move before any of this runs, so both
        fixes cover that case and a test using one cannot tell them apart — written first with an
        illegal move, it passed with the reorder undone.

        What the ordering protects is the case the guard cannot: a move that IS legal and whose
        push fails anyway — a malformed position, an engine fault. `push()` rolls back its own
        board and knows nothing about the other one, so a pocket written first would stay written
        for a move that never happened, and nothing would ever take it back.
        """
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()

        # A legal capture: 1. e4 d5 2. exd5 sends a pawn to the partner's pocket.
        await play_move_bug(get_app_state(self.app), mover, game, "e2e4", CLOCKS, CLOCKS, "a")
        await play_move_bug(
            get_app_state(self.app), self.players[1], game, "d7d5", CLOCKS, CLOCKS, "a"
        )
        before = game.boards["b"].fen
        # The brackets are always there; it is what is BETWEEN them that a capture changes.
        pocket = before[before.find("[") + 1 : before.find("]")]
        self.assertEqual(pocket, "", "the partner pocket should still be empty at this point")

        # The push fails on a move the guard has already passed.
        with patch.object(game.boards["a"], "push", side_effect=RuntimeError("engine fault")):
            await play_move_bug(get_app_state(self.app), mover, game, "e4d5", CLOCKS, CLOCKS, "a")

        self.assertEqual(
            game.boards["b"].fen,
            before,
            "a capture whose push failed must not feed the partner's pocket",
        )

    async def test_a_legal_move_still_works(self):
        """The guard against fixing the refusal by refusing everything."""
        game = self.make_game()
        mover = self.players[0]
        mover.send_game_message = AsyncMock()

        await play_move_bug(get_app_state(self.app), mover, game, "e2e4", CLOCKS, CLOCKS, "a")

        played = [step.get("move") for step in game.steps if step.get("move")]
        self.assertEqual(played, ["e2e4"])
        self.assertEqual(game.status, STARTED)


if __name__ == "__main__":
    unittest.main()
