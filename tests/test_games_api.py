# -*- coding: utf-8 -*-
import json
import time
import unittest
from unittest.mock import patch

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import STARTED
from game import Game
from game_api import _seen_discontinued_variants, variant_counts_from_docs
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import VARIANTS

test_logger.init_test_logger()


class GamesApiCategoryFilterTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.user = User(app_state, username="testuser", game_category="chess")
        app_state.users[self.user.username] = self.user

        wplayer = User(app_state, username="white")
        bplayer = User(app_state, username="black")
        app_state.users[wplayer.username] = wplayer
        app_state.users[bplayer.username] = bplayer

        chess_game = Game(app_state, "g1", "chess", "", wplayer, bplayer)
        chess_game.status = STARTED
        app_state.games[chess_game.id] = chess_game

        shogi_game = Game(app_state, "g2", "shogi", "", wplayer, bplayer)
        shogi_game.status = STARTED
        app_state.games[shogi_game.id] = shogi_game

        chess960_game = Game(app_state, "g3", "chess", "", wplayer, bplayer, chess960=True)
        chess960_game.status = STARTED
        app_state.games[chess960_game.id] = chess960_game

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_games_filtered_by_category(self):
        session_data = {"session": {"user_name": self.user.username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

        response = await self.client.get("/api/games")
        self.assertEqual(response.status, 200)
        payload = await response.json()

        variants = {(item["variant"], item["chess960"]) for item in payload}
        self.assertIn(("chess", False), variants)
        self.assertIn(("chess", True), variants)
        self.assertNotIn(("shogi", False), variants)


class VariantStatsTestCase(unittest.TestCase):
    def test_discontinued_variants_logged_once(self):
        variant_counts = {variant: [] for variant in VARIANTS}
        docs = [
            {"_id": {"p": "202501", "v": "m", "z": 1}, "c": 1},
            {"_id": {"p": "202501", "v": "m", "z": 1}, "c": 2},
            {"_id": {"p": "202501", "v": "o", "z": 0}, "c": 3},
            {"_id": {"p": "202501", "v": "o", "z": 0}, "c": 4},
        ]

        _seen_discontinued_variants.clear()
        try:
            with patch("game_api.log.info") as info:
                variant_counts_from_docs(variant_counts, docs)

            warned_variants = {call.args[1] for call in info.call_args_list}
            self.assertEqual({"makruk960", "gothic"}, warned_variants)
            self.assertEqual(2, info.call_count)
        finally:
            _seen_discontinued_variants.clear()
