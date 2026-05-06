import unittest
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import INVALIDMOVE, STARTED
from game import Game
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from utils import play_move
from variants import VARIANTS


PERFS = new_default_perf_map(VARIANTS)

ATOMIC_960_START_FEN = "qrkbbnrn/pppppppp/8/8/8/8/PPPPPPPP/QRKBBNRN w BGbg - 0 1"
PRE_CASTLE_MOVES = (
    "f1e3",
    "b7b5",
    "e3d5",
    "c7c6",
    "d5e7",
    "g8e8",
    "e2e3",
    "e8e3",
    "d1g4",
    "f7f5",
    "g4h5",
    "g7g6",
    "h1g3",
    "g6h5",
    "b2b3",
    "c6c5",
    "a1e5",
)
PRE_CASTLE_FEN = "qrk4n/p2p3p/8/1pp1Qp2/8/1P4N1/P1PP1PPP/1RK1B1R1 b GBb - 1 9"
POST_CASTLE_FEN = "q1kr3n/p2p3p/8/1pp1Qp2/8/1P4N1/P1PP1PPP/1RK1B1R1 w GB - 2 10"


class StaleAtomicBotMoveTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.player = User(app_state, username="atomic-human", perfs=PERFS)
        app_state.users[self.player.username] = self.player
        self.bot = app_state.users["Fairy-Stockfish"]
        self.white = User(app_state, username="position-white", perfs=PERFS)
        self.black = User(app_state, username="position-black", perfs=PERFS)
        app_state.users[self.white.username] = self.white
        app_state.users[self.black.username] = self.black

    async def get_application(self):
        app = make_app(db_client=cast(Any, AsyncMongoMockClient(tz_aware=True)))
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def new_game(self) -> Game:
        game = Game(
            get_app_state(self.app),
            id8(),
            "atomic",
            ATOMIC_960_START_FEN,
            self.bot,
            self.player,
            rated=False,
            chess960=True,
        )
        self.bot.game_queues[game.id] = cast(Any, None)
        return game

    def new_human_game(self) -> Game:
        return Game(
            get_app_state(self.app),
            id8(),
            "chess",
            "",
            self.white,
            self.black,
            rated=False,
        )

    async def play_prefix(self, game: Game) -> None:
        for ply, move in enumerate(PRE_CASTLE_MOVES, start=1):
            clocks = [game.clocks_w[-1], game.clocks_b[-1]]
            await game.play_move(move, clocks=clocks, ply=ply)

    async def test_takeback_then_replacement_move_ignores_stale_original_when_ply_matches(self):
        app_state = get_app_state(self.app)
        game = self.new_game()
        await self.play_prefix(game)

        self.assertEqual(game.board.fen, PRE_CASTLE_FEN)
        self.assertEqual(game.ply, 17)

        await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=18)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.status, STARTED)

        await game.takeback()
        self.assertEqual(game.board.fen, PRE_CASTLE_FEN)
        self.assertEqual(game.ply, 17)

        await play_move(app_state, self.player, game, "c8b8", clocks=[300000, 300000], ply=18)
        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b8")
        self.assertEqual(game.status, STARTED)

        # This is the stock-client shape: the stale move still carries its original ply.
        await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=18)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b8")
        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")

    async def test_human_stale_resend_gets_board_sync_instead_of_game_loss(self):
        app_state = get_app_state(self.app)
        game = self.new_game()
        await self.play_prefix(game)
        await play_move(app_state, self.player, game, "c8b8", clocks=[300000, 300000], ply=18)

        with patch.object(self.player, "send_game_message", new=AsyncMock()) as mock_send:
            await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=18)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.board.color, 0)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b8")
        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        mock_send.assert_awaited_once()
        payload = mock_send.await_args.args[1]
        self.assertEqual(payload["type"], "board")
        self.assertEqual(payload["fen"], POST_CASTLE_FEN)
        self.assertEqual(payload["ply"], 18)
        self.assertEqual(payload["status"], STARTED)

    async def test_takeback_then_replacement_move_without_ply_is_still_ignored_as_out_of_turn(self):
        app_state = get_app_state(self.app)
        game = self.new_game()
        await self.play_prefix(game)

        await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=18)
        await game.takeback()
        await play_move(app_state, self.player, game, "c8b8", clocks=[300000, 300000], ply=18)

        # Even without ply, the normal human websocket path still rejects this message
        # because after c8b8 it is White's turn.
        await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=None)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b8")
        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")

    async def test_fen_turn_guard_repairs_color_desync_and_resyncs_human(self):
        app_state = get_app_state(self.app)
        game = self.new_game()
        await self.play_prefix(game)
        await play_move(app_state, self.player, game, "c8b8", clocks=[300000, 300000], ply=18)

        game.board.color = 1

        with patch.object(self.player, "send_game_message", new=AsyncMock()) as mock_send:
            await play_move(app_state, self.player, game, "c8b7", clocks=[300000, 300000], ply=None)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.board.color, 0)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b8")
        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        mock_send.assert_awaited_once()
        payload = mock_send.await_args.args[1]
        self.assertEqual(payload["type"], "board")
        self.assertEqual(payload["fen"], POST_CASTLE_FEN)
        self.assertEqual(payload["ply"], 18)
        self.assertEqual(payload["status"], STARTED)

    async def test_position_id_rejects_stale_human_move_even_when_ply_turn_and_move_are_otherwise_valid(
        self,
    ):
        app_state = get_app_state(self.app)
        game = self.new_human_game()

        stale_position_id = ""
        opening = ("e2e4", "e7e5", "g1f3", "b8c6")
        for ply, move in enumerate(opening, start=1):
            clocks = [game.clocks_w[-1], game.clocks_b[-1]]
            await game.play_move(move, clocks=clocks, ply=ply)
            if ply == 2:
                stale_position_id = game.position_id()

        self.assertEqual(game.ply, 4)
        self.assertEqual(game.turn_player, self.white.username)

        with patch.object(self.white, "send_game_message", new=AsyncMock()) as mock_send:
            await play_move(
                app_state,
                self.white,
                game,
                "f1c4",
                clocks=[300000, 300000],
                ply=5,
                position_id=stale_position_id,
            )

        self.assertEqual(game.ply, 4)
        self.assertEqual(game.lastmove, "b8c6")
        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        mock_send.assert_awaited_once()
        payload = mock_send.await_args.args[1]
        self.assertEqual(payload["type"], "board")
        self.assertEqual(payload["ply"], 4)
        self.assertEqual(payload["fen"], game.board.fen)
        self.assertEqual(payload["positionId"], game.position_id())

    async def test_exact_logged_fen_only_fails_after_bypassing_server_side_turn_checks(self):
        game = self.new_game()
        await self.play_prefix(game)
        clocks = [game.clocks_w[-1], game.clocks_b[-1]]
        await game.play_move("c8b8", clocks=clocks, ply=18)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.status, STARTED)

        # This reproduces the production symptom at the Game/FairyBoard layer:
        # if c8b7 reaches game.play_move() on the logged FEN, it becomes INVALIDMOVE.
        await game.play_move("c8b7", clocks=[300000, 300000], ply=None)

        self.assertEqual(game.board.fen, POST_CASTLE_FEN)
        self.assertEqual(game.ply, 18)
        self.assertEqual(game.lastmove, "c8b7")
        self.assertEqual(game.status, INVALIDMOVE)
        self.assertEqual(game.result, "0-1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
