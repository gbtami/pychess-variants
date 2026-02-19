# -*- coding: utf-8 -*-

import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import test_logger
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from ai import bot_game_tasks
from clock import BOT_FIRST_MOVE_TIMEOUT
from compress import R2C
from const import ABORTED, CASUAL
from fairy import FairyBoard
from game import Game
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from utils import load_game
from variants import get_server_variant
import pychess_global_app_state
import ai
import user as user_module

test_logger.init_test_logger()


class CacheCleanupTestCase(AioHTTPTestCase):
    async def get_application(self):
        # Use the in-memory Mongo mock so we can load/save games without touching a real DB.
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def _insert_user_doc(self, username):
        # load_game() expects user documents for non-anon usernames.
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one({"_id": username})

    async def _wait_for_bot_task(self, game_id):
        # BOT_task registers game tasks with a predictable name; poll until it appears.
        while True:
            for task in list(bot_game_tasks):
                if task.get_name() == f"bot-game-{game_id}":
                    return task
            await asyncio.sleep(0)

    async def test_load_finished_game_cancels_clock(self):
        app_state = get_app_state(self.app)

        await self._insert_user_doc("white")
        await self._insert_user_doc("black")

        variant_code = get_server_variant("chess", False).code
        doc = {
            "_id": "finished-game",
            "us": ["white", "black"],
            "p0": {"e": "1500?"},
            "p1": {"e": "1500?"},
            "v": variant_code,
            "b": 1,
            "i": 0,
            "bp": 0,
            "m": [],
            "d": datetime.now(timezone.utc),
            "f": FairyBoard.start_fen("chess"),
            "s": ABORTED,
            "r": R2C["*"],
            "x": 0,
            "y": int(CASUAL),
            "z": 0,
            "c": False,
        }
        await app_state.db.game.insert_one(doc)

        game = await load_game(app_state, doc["_id"])

        # Finished games must not keep a live clock task; cancel() clears the task ref.
        self.assertIsNone(game.stopwatch.clock_task)

    async def test_load_finished_bughouse_cancels_clocks(self):
        app_state = get_app_state(self.app)

        for username in ("wa", "ba", "wb", "bb"):
            await self._insert_user_doc(username)

        variant_code = get_server_variant("bughouse", False).code
        doc = {
            "_id": "finished-bughouse",
            "us": ["wa", "ba", "wb", "bb"],
            "p0": {"e": "1500?"},
            "p1": {"e": "1500?"},
            "p2": {"e": "1500?"},
            "p3": {"e": "1500?"},
            "v": variant_code,
            "b": 1,
            "i": 0,
            "m": [],
            "o": [],
            "d": datetime.now(timezone.utc),
            "f": FairyBoard.start_fen("bughouse"),
            "s": ABORTED,
            "r": R2C["*"],
            "x": 0,
            "y": int(CASUAL),
            "z": 0,
        }
        await app_state.db.game.insert_one(doc)

        game = await load_game(app_state, doc["_id"])

        # Bughouse finished games should cancel both board clock tasks.
        self.assertIsNone(game.gameClocks.stopwatches["a"].clock_task)
        self.assertIsNone(game.gameClocks.stopwatches["b"].clock_task)

    async def test_bot_first_move_timeout_enabled(self):
        app_state = get_app_state(self.app)

        human = User(app_state, username="human")
        app_state.users[human.username] = human

        bot = app_state.users["Random-Mover"]

        game = Game(
            app_state,
            "bot-timeout",
            "chess",
            "",
            human,
            bot,
            base=1,
            inc=0,
            rated=False,
        )

        # Bot games should not keep an unlimited first-move clock in casual mode.
        self.assertTrue(game.stopwatch.running)
        self.assertEqual(game.stopwatch.secs, BOT_FIRST_MOVE_TIMEOUT)

    async def test_clock_timeout_notifies_bot_queue(self):
        app_state = get_app_state(self.app)

        human = User(app_state, username="human2")
        app_state.users[human.username] = human

        bot = app_state.users["Random-Mover"]
        game = Game(
            app_state,
            "bot-clock",
            "chess",
            "",
            human,
            bot,
            base=1,
            inc=0,
            rated=False,
        )
        bot.game_queues[game.id] = asyncio.Queue()

        # Force the clock to expire immediately without waiting real time.
        game.stopwatch.secs = 0
        game.stopwatch.running = True

        msg = await asyncio.wait_for(bot.game_queues[game.id].get(), timeout=1)

        # When the clock ends the game, the bot queue should receive a gameEnd.
        self.assertEqual(msg, game.game_end)

    async def test_bot_game_task_exits_without_messages(self):
        app_state = get_app_state(self.app)

        human = User(app_state, username="human3")
        app_state.users[human.username] = human

        bot = app_state.users["Random-Mover"]
        bot.game_queues.clear()

        game = Game(
            app_state,
            "bot-task",
            "chess",
            "",
            human,
            bot,
            base=1,
            inc=0,
            rated=False,
        )
        app_state.games[game.id] = game
        bot.game_queues[game.id] = asyncio.Queue()

        # Make the polling interval tiny so the test completes quickly.
        original_poll = ai.BOT_QUEUE_POLL_SECS
        ai.BOT_QUEUE_POLL_SECS = 0.01
        try:
            await bot.event_queue.put(game.game_start)
            task = await asyncio.wait_for(self._wait_for_bot_task(game.id), timeout=1)

            self.assertFalse(task.done())

            # End the game without enqueuing any gameState messages.
            game.status = ABORTED

            # The bot task should notice the status change and exit promptly.
            await asyncio.wait_for(task, timeout=1)
            self.assertTrue(task.done())
        finally:
            ai.BOT_QUEUE_POLL_SECS = original_poll

    async def test_remove_from_cache_prunes_idle_anon(self):
        app_state = get_app_state(self.app)

        anon = User(app_state, username="AnonTest", anon=True)
        app_state.users[anon.username] = anon

        human = User(app_state, username="human4")
        app_state.users[human.username] = human

        game = Game(
            app_state,
            "anon-cleanup",
            "chess",
            "",
            anon,
            human,
            base=1,
            inc=0,
            rated=False,
        )

        # Mark the game as finished so game_in_progress is cleared.
        game.update_status(ABORTED, "*")

        # Avoid waiting in remove_from_cache during tests.
        original_keep = pychess_global_app_state.LOCALHOST_CACHE_KEEP_TIME
        pychess_global_app_state.LOCALHOST_CACHE_KEEP_TIME = 0
        try:
            await app_state.remove_from_cache(game)
        finally:
            pychess_global_app_state.LOCALHOST_CACHE_KEEP_TIME = original_keep

        # An idle anon user should be removed from the cache and have no running cleanup task.
        self.assertNotIn(anon.username, app_state.users)
        self.assertIsNone(anon.remove_anon_task)

    async def test_user_remove_ignores_missing_cache_entry(self):
        app_state = get_app_state(self.app)
        ghost = User(app_state, username="Anon-missing-cleanup")
        ghost.online = False

        async def no_sleep(_seconds):
            return None

        with patch.object(user_module.asyncio, "sleep", new=no_sleep):
            await ghost.remove()

        self.assertNotIn(ghost.username, app_state.users)

    async def test_user_remove_does_not_delete_replaced_instance(self):
        app_state = get_app_state(self.app)
        old_user = User(app_state, username="Anon-replaced-cleanup")
        new_user = User(app_state, username="Anon-replaced-cleanup")
        app_state.users[old_user.username] = new_user
        old_user.online = False

        async def no_sleep(_seconds):
            return None

        with patch.object(user_module.asyncio, "sleep", new=no_sleep):
            await old_user.remove()

        self.assertIn(old_user.username, app_state.users)
        self.assertIs(app_state.users[old_user.username], new_user)


if __name__ == "__main__":
    unittest.main()
