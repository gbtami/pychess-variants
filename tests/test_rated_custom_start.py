import unittest
from types import SimpleNamespace

import test_logger

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import CASUAL, RATED
from game import Game
from glicko2.glicko2 import new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from rated_start import (
    CAPABLANCA_RATED_START_FENS,
    CHESS_NO_CASTLE_FEN,
    RATED_CUSTOM_START_FENS,
    can_rate_custom_start,
)
from seek import Seek
from server import make_app
from user import User
from valid_fen import VALID_FEN
from variants import VARIANTS


test_logger.init_test_logger()

UPSIDE_DOWN_FEN = "RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr w - - 0 1"


class RatedCustomStartTestCase(unittest.TestCase):
    def make_user(self, username: str) -> User:
        return User(
            SimpleNamespace(anon_as_test_users=False),
            username=username,
            perfs=new_default_perf_map(VARIANTS),
        )

    def test_empty_start_remains_rateable(self):
        self.assertTrue(can_rate_custom_start("chess", ""))
        self.assertTrue(can_rate_custom_start("chess", None))

    def test_capablanca_allowlist_matches_accepted_alternate_fens(self):
        self.assertEqual(
            RATED_CUSTOM_START_FENS["capablanca"],
            frozenset(VALID_FEN["capablanca"]),
        )
        self.assertEqual(
            RATED_CUSTOM_START_FENS["capahouse"],
            frozenset(VALID_FEN["capahouse"]),
        )

    def test_curated_start_check_normalizes_whitespace(self):
        spaced_fen = f"  {CHESS_NO_CASTLE_FEN.replace(' ', '   ')}  "
        self.assertTrue(can_rate_custom_start("chess", spaced_fen))

    def test_curated_chess_no_castle_start_is_rateable(self):
        creator = self.make_user("creator")
        seek = Seek(
            "rated-no-castle",
            creator,
            "chess",
            fen=CHESS_NO_CASTLE_FEN,
            rated=True,
        )

        self.assertEqual(RATED, seek.rated)

    def test_curated_capablanca_start_is_rateable(self):
        creator = self.make_user("creator")
        seek = Seek(
            "rated-gothic",
            creator,
            "capablanca",
            fen=CAPABLANCA_RATED_START_FENS[4],
            rated=True,
        )

        self.assertEqual(RATED, seek.rated)

    def test_unapproved_custom_start_is_forced_casual(self):
        creator = self.make_user("creator")
        seek = Seek("casual-upside-down", creator, "chess", fen=UPSIDE_DOWN_FEN, rated=True)

        self.assertEqual(CASUAL, seek.rated)

    def test_curated_start_is_not_rateable_as_chess960(self):
        creator = self.make_user("creator")
        seek = Seek(
            "casual-960-custom",
            creator,
            "chess",
            fen=CHESS_NO_CASTLE_FEN,
            rated=True,
            chess960=True,
        )

        self.assertEqual(CASUAL, seek.rated)


class RatedCustomStartGameDefenseTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.white = User(app_state, username="white")
        self.black = User(app_state, username="black")

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(tz_aware=True))
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_new_game_keeps_curated_custom_start_rated(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "curated1",
            "chess",
            CHESS_NO_CASTLE_FEN,
            self.white,
            self.black,
            rated=RATED,
            create=True,
        )
        try:
            self.assertEqual(RATED, game.rated)
        finally:
            await game.stopwatch.cancel()

    async def test_new_game_downgrades_unapproved_custom_start(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "unsafe01",
            "chess",
            UPSIDE_DOWN_FEN,
            self.white,
            self.black,
            rated=RATED,
            create=True,
        )
        try:
            self.assertEqual(CASUAL, game.rated)
        finally:
            await game.stopwatch.cancel()

    async def test_empty_chess960_start_remains_rated(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "chess960",
            "chess",
            "",
            self.white,
            self.black,
            rated=RATED,
            chess960=True,
            create=True,
        )
        try:
            self.assertEqual(RATED, game.rated)
        finally:
            await game.stopwatch.cancel()

    async def test_loaded_historical_game_keeps_recorded_rating(self):
        app_state = get_app_state(self.app)
        game = Game(
            app_state,
            "legacy01",
            "chess",
            UPSIDE_DOWN_FEN,
            self.white,
            self.black,
            rated=RATED,
            create=False,
        )
        try:
            self.assertEqual(RATED, game.rated)
        finally:
            await game.stopwatch.cancel()
