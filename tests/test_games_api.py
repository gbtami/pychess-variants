# -*- coding: utf-8 -*-
import json
import time

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import STARTED
from game import Game
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User

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
