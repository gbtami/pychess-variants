# -*- coding: utf-8 -*-

import logging
import unittest
from datetime import datetime
from operator import neg

from sortedcollections import ValueSortedDict

from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

from const import CREATED, RESIGN, VARIANTS
from utils import Game, User
from glicko2.glicko2 import DEFAULT_PERF, Glicko2, WIN, LOSS
from server import make_app

logging.basicConfig()
logging.getLogger().setLevel(level=logging.ERROR)

ZH960 = {
    "user0": 1868,
    "user1": 1861,
    "user2": 1696,
    "user3": 1685,
    "user4": 1681,
    "user5": 1668,
    "user6": 1644,
    "user7": 1642,  # peekitem(7)
    "user8": 1642,
    "user9": 1639,
}

PERFS = {
    "user7": {variant: DEFAULT_PERF for variant in VARIANTS},
    "newplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
    "strongplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
    "weakplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
}
PERFS["user7"]["crazyhouse960"] = {
    "gl": {
        "r": 1642,
        "d": 125,
        "v": 0.06
    },
    "la": datetime.utcnow(),
    "nb": 12
}

PERFS["newplayer"]["crazyhouse960"] = {
    "gl": {
        "r": 1500,
        "d": 136,
        "v": 0.06
    },
    "la": datetime.utcnow(),
    "nb": 7
}

PERFS["strongplayer"]["crazyhouse960"] = {
    "gl": {
        "r": 1500,
        "d": 350,
        "v": 0.06
    },
    "la": datetime.utcnow(),
    "nb": 0
}

PERFS["weakplayer"]["crazyhouse960"] = {
    "gl": {
        "r": 1500,
        "d": 350,
        "v": 0.06
    },
    "la": datetime.utcnow(),
    "nb": 0
}


class RequestLobbyTestCase(AioHTTPTestCase):

    async def get_application(self):
        app = make_app(with_db=False)
        return app

    @unittest_run_loop
    async def test_example(self):
        resp = await self.client.request("GET", "/")
        assert resp.status == 200
        text = await resp.text()
        assert "<title>Lobby" in text


class HighscoreTestCase(AioHTTPTestCase):

    async def startup(self, app):
        self.app["highscore"] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
        self.app["highscore"]["crazyhouse960"] = ValueSortedDict(neg, ZH960)

        self.wplayer = User(self.app, username="user7", perfs=PERFS["user7"])
        self.bplayer = User(self.app, username="newplayer", perfs=PERFS["newplayer"])
        self.strong_player = User(self.app, username="strongplayer", perfs=PERFS["strongplayer"])
        self.weak_player = User(self.app, username="weakplayer", perfs=PERFS["weakplayer"])

    async def get_application(self):
        app = make_app(with_db=False)
        app.on_startup.append(self.startup)
        return app

    def print_game_highscore(self, game):
        return
        print("----")
        for row in game.highscore["crazyhouse960"].items():
            print(row)

    @unittest_run_loop
    async def test_lost_but_still_there(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.bplayer, rated=True, chess960=True, create=True)
        self.assertEqual(game.status, CREATED)

        self.print_game_highscore(game)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        game.update_status(status=RESIGN, result="0-1")
        game.stopwatch.kill()
        await game.update_ratings()

        self.print_game_highscore(game)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username in game.highscore["crazyhouse960"])

    @unittest_run_loop
    async def test_lost_and_out(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.strong_player, rated=True, chess960=True, create=True)
        self.assertEqual(game.status, CREATED)

        self.print_game_highscore(game)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        game.update_status(status=RESIGN, result="0-1")
        game.stopwatch.kill()
        await game.update_ratings()

        self.print_game_highscore(game)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username not in game.highscore["crazyhouse960"])

    @unittest_run_loop
    async def test_win_and_in(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.strong_player, self.weak_player, rated=True, chess960=True, create=True)
        self.assertEqual(game.status, CREATED)

        self.print_game_highscore(game)

        game.update_status(status=RESIGN, result="1-0")
        game.stopwatch.kill()
        await game.update_ratings()

        self.print_game_highscore(game)

        self.assertTrue(self.weak_player.username not in game.highscore["crazyhouse960"])
        self.assertTrue(self.strong_player.username in game.highscore["crazyhouse960"])


class TestRatings(AioHTTPTestCase):

    async def get_application(self):
        app = make_app(with_db=False)
        return app

    async def setUpAsync(self):
        self.gl2 = Glicko2(tau=0.5)

    @unittest_run_loop
    async def test_new_rating(self):
        # New User ratings are equals to default

        default_rating = self.gl2.create_rating()

        user = User(self.app, username="testuser", perfs={variant: DEFAULT_PERF for variant in VARIANTS})
        result = user.get_rating("chess", False)

        self.assertEqual(result.mu, default_rating.mu)

    @unittest_run_loop
    async def test_rating(self):
        # New Glicko2 rating calculation example from original paper

        u1 = User(self.app, username="testuser", perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1500, "d": 200, "v": 0.06}}})
        r1 = u1.get_rating("chess", False)

        self.assertEqual(r1.mu, 1500)
        self.assertEqual(r1.phi, 200)
        self.assertEqual(r1.sigma, 0.06)

        u2 = User(self.app, perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1400, "d": 30, "v": 0.06}}})
        r2 = u2.get_rating("chess", False)
        self.assertEqual(r2.mu, 1400)

        u3 = User(self.app, perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1550, "d": 100, "v": 0.06}}})
        r3 = u3.get_rating("chess", False)
        self.assertEqual(r3.mu, 1550)

        u4 = User(self.app, perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1700, "d": 300, "v": 0.06}}})
        r4 = u4.get_rating("chess", False)
        self.assertEqual(r4.mu, 1700)

        new_rating = self.gl2.rate(r1, [(WIN, r2), (LOSS, r3), (LOSS, r4)])

        self.assertEqual(round(new_rating.mu, 3), 1464.051)
        self.assertEqual(round(new_rating.phi, 3), 151.515)
        self.assertEqual(round(new_rating.sigma, 6), 0.059996)

        await u1.set_rating("chess", False, new_rating)

        r1 = u1.get_rating("chess", False)

        self.assertEqual(round(r1.mu, 3), 1464.051)
        self.assertEqual(round(r1.phi, 3), 151.515)
        self.assertEqual(round(r1.sigma, 6), 0.059996)


if __name__ == '__main__':
    unittest.main(verbosity=2)
