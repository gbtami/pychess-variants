# -*- coding: utf-8 -*-

import asyncio
import unittest
import weakref
from datetime import datetime
from operator import neg

from sortedcollections import ValueSortedDict

from utils import Game, User, CREATED, DEFAULT_PERF, RESIGN, VARIANTS
from glicko2.glicko2 import Glicko2, WIN, LOSS

ZH960 = {
    "d4rkn3ss23": 1868,
    "Nordlandia": 1861,
    "catask": 1696,
    "LegionDestroyer": 1685,
    "vectorveld": 1681,
    "eekarf": 1668,
    "the_Crocodile_Hunter": 1644,
    "Doooovid": 1642,
    "dlrowolleh": 1642,
    "dovijanic": 1639,
}

PERFS = {
    "Doooovid": {variant: DEFAULT_PERF for variant in VARIANTS},
    "pepellou": {variant: DEFAULT_PERF for variant in VARIANTS},
    "strongplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
}
PERFS["Doooovid"]["crazyhouse960"] = {
    "gl": {
        "r": 1642,
        "d": 125,
        "v": 0.06
    },
    "la": datetime.utcnow(),
    "nb": 12
}

PERFS["pepellou"]["crazyhouse960"] = {
    "gl": {
        "r": 1481,
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
    "nb": 7
}


class HighscoreTestCase(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.get_event_loop()
        self.app = {}
        self.app["db"] = None
        self.app["users"] = {}
        self.app["games"] = {}
        self.app["tasks"] = weakref.WeakSet()
        self.app["crosstable"] = {}
        self.app["highscore"] = {variant: ValueSortedDict(neg) for variant in VARIANTS}
        self.app["highscore"]["crazyhouse960"] = ValueSortedDict(neg, ZH960)

        self.wplayer = User(username="Doooovid", perfs=PERFS["Doooovid"])
        self.bplayer = User(username="pepellou", perfs=PERFS["pepellou"])
        self.splayer = User(username="strongplayer", perfs=PERFS["strongplayer"])

    def test_lost_but_still_there(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.bplayer, rated=True, chess960=True, create=True)
        self.assertEqual(game.status, CREATED)

        for row in game.highscore["crazyhouse960"].items():
            print(row)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        game.update_status(status=RESIGN, result="0-1")
        self.loop.run_until_complete(game.update_ratings())

        print("-------")
        print(game.p0, game.p1)
        print(self.bplayer.perfs["crazyhouse960"])
        print(self.wplayer.perfs["crazyhouse960"])

        for row in game.highscore["crazyhouse960"].items():
            print(row)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username in game.highscore["crazyhouse960"])

    def test_lost_and_out(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.splayer, rated=True, chess960=True, create=True)
        self.assertEqual(game.status, CREATED)

        for row in game.highscore["crazyhouse960"].items():
            print(row)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        game.update_status(status=RESIGN, result="0-1")
        self.loop.run_until_complete(game.update_ratings())

        print("-------")
        print(game.p0, game.p1)
        print(self.splayer.perfs["crazyhouse960"])
        print(self.wplayer.perfs["crazyhouse960"])

        for row in game.highscore["crazyhouse960"].items():
            print(row)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username not in game.highscore["crazyhouse960"])


class TestRatings(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.get_event_loop()
        self.gl2 = Glicko2(tau=0.5)

    def test_new_rating(self):
        new_rating = self.gl2.create_rating()

        user = User(username="testuser", perfs={variant: DEFAULT_PERF for variant in VARIANTS})
        result = user.get_rating("chess", False)
        self.assertEqual(result.mu, new_rating.mu)

    def test_rating(self):
        u1 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1500, "d": 200, "v": 0.06}}})
        r1 = u1.get_rating("chess", False)

        self.assertEqual(r1.mu, 1500)
        self.assertEqual(r1.phi, 200)
        self.assertEqual(r1.sigma, 0.06)

        u2 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1400, "d": 30, "v": 0.06}}})
        r2 = u2.get_rating("chess", False)
        self.assertEqual(r2.mu, 1400)

        u3 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1550, "d": 100, "v": 0.06}}})
        r3 = u3.get_rating("chess", False)
        self.assertEqual(r3.mu, 1550)

        u4 = User(perfs={"chess": {"la": datetime.utcnow(), "gl": {"r": 1700, "d": 300, "v": 0.06}}})
        r4 = u4.get_rating("chess", False)
        self.assertEqual(r4.mu, 1700)

        async def coro():
            rating = await self.gl2.rate(r1, [(WIN, r2), (LOSS, r3), (LOSS, r4)])
            return rating

        new_rating = self.loop.run_until_complete(coro())

        self.assertEqual(round(new_rating.mu, 3), 1464.051)
        self.assertEqual(round(new_rating.phi, 3), 151.515)
        self.assertEqual(round(new_rating.sigma, 6), 0.059996)

        async def coro(user, rating):
            await user.set_rating("chess", False, rating)

        self.loop.run_until_complete(coro(u1, new_rating))
        r1 = u1.get_rating("chess", False)

        self.assertEqual(round(r1.mu, 3), 1464.051)
        self.assertEqual(round(r1.phi, 3), 151.515)
        self.assertEqual(round(r1.sigma, 6), 0.059996)


if __name__ == '__main__':
    unittest.main(verbosity=2)
