import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import CHEAT, STARTED
from game import Game
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS
from wsr import handle_ceval_detected


PERFS = new_default_perf_map(VARIANTS)
CLOCKS = [60_000, 60_000]


class CevalDetectionTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.wplayer = User(app_state, username="wplayer-ceval", perfs=PERFS)
        self.bplayer = User(app_state, username="bplayer-ceval", perfs=PERFS)
        self.bot = User(app_state, bot=True, username="bot-ceval", perfs=PERFS)

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True))
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def new_game(
        self,
        *,
        variant: str = "chess",
        initial_fen: str = "",
        corr: bool = False,
        wplayer: User | None = None,
        bplayer: User | None = None,
    ) -> Game:
        return Game(
            get_app_state(self.app),
            id8(),
            variant,
            initial_fen,
            wplayer or self.wplayer,
            bplayer or self.bplayer,
            rated=False,
            corr=corr,
        )

    async def play_plies(self, game: Game, moves: tuple[str, ...]) -> None:
        for ply, move in enumerate(moves, start=1):
            clocks = [
                game.clocks_w[-1] if game.clocks_w else CLOCKS[0],
                game.clocks_b[-1] if game.clocks_b else CLOCKS[1],
            ]
            await game.play_move(move, clocks=clocks, ply=ply)

    def matching_payload(self, game: Game) -> dict[str, object]:
        return {
            "type": "ceval_detected",
            "gameId": game.id,
            "variant": game.variant,
            "chess960": bool(game.chess960),
            "fen": game.board.fen,
        }

    async def test_ceval_detection_forfeits_matching_live_game(self):
        game = self.new_game()
        await self.play_plies(game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))

        ws = AsyncMock()
        self.bplayer.send_game_message = AsyncMock()

        await handle_ceval_detected(
            ws,
            users={self.bplayer.username: self.bplayer},
            user=self.wplayer,
            data=self.matching_payload(game),
            game=game,
        )

        self.assertEqual(game.status, CHEAT)
        self.assertEqual(game.result, "0-1")
        ws.send_json.assert_awaited()
        self.bplayer.send_game_message.assert_awaited()

    async def test_ceval_detection_ignores_position_mismatch(self):
        game = self.new_game()
        await self.play_plies(game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))

        ws = AsyncMock()
        payload = self.matching_payload(game)
        payload["fen"] = (
            game.initial_fen or "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        )

        await handle_ceval_detected(
            ws,
            users={},
            user=self.wplayer,
            data=payload,
            game=game,
        )

        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        ws.send_json.assert_not_awaited()

    async def test_ceval_detection_respects_minimum_played_plies(self):
        start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 34"
        game = self.new_game(initial_fen=start_fen)
        await self.play_plies(game, ("e2e4", "e7e5", "g1f3", "b8c6"))

        ws = AsyncMock()

        await handle_ceval_detected(
            ws,
            users={},
            user=self.wplayer,
            data=self.matching_payload(game),
            game=game,
        )

        self.assertEqual(game.status, STARTED)
        self.assertEqual(game.result, "*")
        ws.send_json.assert_not_awaited()

    async def test_ceval_detection_ignores_excluded_game_types(self):
        excluded_games = []

        corr_game = self.new_game(corr=True)
        await self.play_plies(corr_game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))
        excluded_games.append(corr_game)

        bot_game = self.new_game(bplayer=self.bot)
        await self.play_plies(bot_game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))
        excluded_games.append(bot_game)

        hidden_game = self.new_game()
        await self.play_plies(hidden_game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))
        hidden_game.fow = True
        excluded_games.append(hidden_game)

        jieqi_game = self.new_game()
        await self.play_plies(jieqi_game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))
        jieqi_game.jieqi = True
        excluded_games.append(jieqi_game)

        two_board_game = self.new_game()
        await self.play_plies(two_board_game, ("e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"))
        two_board_game.server_variant = SimpleNamespace(two_boards=True)
        excluded_games.append(two_board_game)

        for excluded_game in excluded_games:
            with self.subTest(game_id=excluded_game.id):
                ws = AsyncMock()
                await handle_ceval_detected(
                    ws,
                    users={},
                    user=excluded_game.wplayer,
                    data=self.matching_payload(excluded_game),
                    game=excluded_game,
                )
                self.assertEqual(excluded_game.status, STARTED)
                self.assertEqual(excluded_game.result, "*")
                ws.send_json.assert_not_awaited()


if __name__ == "__main__":
    unittest.main(verbosity=2)
