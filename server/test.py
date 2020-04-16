# -*- coding: utf-8 -*-

import logging
import unittest
from datetime import datetime
from operator import neg

from sortedcollections import ValueSortedDict

from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

from const import CREATED, STARTED, VARIANTS
from glicko2.glicko2 import DEFAULT_PERF, Glicko2, WIN, LOSS
from game import Game
from user import User
from utils import game_ended
from server import make_app

import game
game.KEEP_TIME = 0
game.MAX_PLY = 120

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
        "r": 1450,
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


class GamePlayTestCase(AioHTTPTestCase):

    async def startup(self, app):
        self.test_player = User(self.app, username="test_player", perfs=PERFS["newplayer"])
        self.random_mover = self.app["users"]["Random-Mover"]

    async def get_application(self):
        app = make_app(with_db=False)
        app.on_startup.append(self.startup)
        return app

    async def play_random(self, game):
        while game.status <= STARTED:
            move = game.random_move
            await game.play_move(move, clocks={"white": 60, "black": 60})

    @unittest_run_loop
    async def test_game_play(self):
        """ Playtest test_player vs Random-Mover """
        for i, variant in enumerate(VARIANTS):
            print(i, variant)
            variant960 = variant.endswith("960")
            variant_name = variant[:-3] if variant960 else variant
            game_id = str(i)
            game = Game(self.app, game_id, variant_name, "", self.test_player, self.random_mover, rated=False, chess960=variant960, create=True)
            self.app["games"][game.id] = game
            self.random_mover.game_queues[game_id] = None

            await self.play_random(game)

            pgn = game.pgn
            pgn_result = pgn[pgn.rfind(" ") + 1:-1]

            self.assertIn(game.result, ("1-0", "0-1", "1/2-1/2"))
            self.assertEqual(game.result, pgn_result)


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
        # return
        print("----")
        print(game.wplayer.perfs["crazyhouse960"])
        print(game.bplayer.perfs["crazyhouse960"])
        for row in game.highscore["crazyhouse960"].items():
            print(row)

    async def play_and_resign(self, game, player):
        clock = game.ply_clocks[0]["white"]
        for i, move in enumerate(("e2e4", "e7e5", "f2f4"), start=1):
            await game.play_move(move, clocks={"white": clock, "black": clock}, ply=i)
        data = {"type": "resign", "gameId": game.id}
        await game_ended(self.app["games"], player, data, data["type"])

    @unittest_run_loop
    async def test_lost_but_still_there(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.bplayer, rated=True, chess960=True, create=True)
        self.app["games"][game.id] = game
        self.assertEqual(game.status, CREATED)
        self.assertEqual(len(game.crosstable["r"]), 0)

        self.print_game_highscore(game)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        # wplayer resign 0-1
        await self.play_and_resign(game, self.wplayer)

        self.print_game_highscore(game)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertEqual(len(game.crosstable["r"]), 1)
        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username in game.highscore["crazyhouse960"])

    @unittest_run_loop
    async def test_lost_and_out(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.wplayer, self.strong_player, rated=True, chess960=True, create=True)
        self.app["games"][game.id] = game
        self.assertEqual(game.status, CREATED)
        self.assertEqual(len(game.crosstable["r"]), 0)

        self.print_game_highscore(game)
        highscore0 = game.highscore["crazyhouse960"].peekitem(7)

        # wplayer resign 0-1
        await self.play_and_resign(game, self.wplayer)

        self.print_game_highscore(game)
        highscore1 = game.highscore["crazyhouse960"].peekitem(7)

        self.assertEqual(len(game.crosstable["r"]), 1)
        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username not in game.highscore["crazyhouse960"].keys()[:10])

    @unittest_run_loop
    async def test_win_and_in_then_lost_and_out(self):
        game = Game(self.app, "12345678", "crazyhouse", "", self.strong_player, self.weak_player, rated=True, chess960=True, create=True)
        self.app["games"][game.id] = game
        self.assertEqual(game.status, CREATED)
        self.assertEqual(len(game.crosstable["r"]), 0)

        self.print_game_highscore(game)

        # weak_player resign 1-0
        await self.play_and_resign(game, self.weak_player)

        self.print_game_highscore(game)

        self.assertEqual(len(game.crosstable["r"]), 1)
        print(game.crosstable)
        self.assertTrue(self.weak_player.username not in game.highscore["crazyhouse960"].keys()[:10])
        self.assertTrue(self.strong_player.username in game.highscore["crazyhouse960"].keys()[:10])

        # now strong player will lose to weak_player and should be out from leaderboard
        game = Game(self.app, "98765432", "crazyhouse", "", self.strong_player, self.weak_player, rated=True, chess960=True, create=True)
        self.app["games"][game.id] = game
        print(game.crosstable)

        # strong_player resign 0-1
        await self.play_and_resign(game, self.strong_player)

        self.print_game_highscore(game)

        print(game.crosstable)
        self.assertEqual(len(game.crosstable["r"]), 2)
        self.assertTrue(self.weak_player.username not in game.highscore["crazyhouse960"].keys()[:10])
        self.assertTrue(self.strong_player.username not in game.highscore["crazyhouse960"].keys()[:10])


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
