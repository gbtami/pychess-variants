# -*- coding: utf-8 -*-

import logging
import unittest
from datetime import datetime, timezone
from operator import neg

from aiohttp.test_utils import AioHTTPTestCase
from sortedcollections import ValueSortedDict

from mongomock_motor import AsyncMongoMockClient

import game
from const import CREATED, STALEMATE, MATE, reserved
from fairy import FairyBoard
from game import Game
from bug.game_bug import GameBug
from glicko2.glicko2 import DEFAULT_PERF, Glicko2, WIN, LOSS
from newid import id8
from server import make_app
from user import User
from utils import sanitize_fen
from pychess_global_app_state_utils import get_app_state
from variants import VARIANTS

game.KEEP_TIME = 0
game.MAX_PLY = 120

logging.basicConfig()
logging.getLogger().setLevel(level=logging.ERROR)

ZH960 = {
    "user0|NM": 1868,
    "user1|IM": 1861,
    "user2|GM": 1696,
    "user3|": 1685,
    "user4|": 1681,
    "user5|": 1668,
    "user6|": 1644,
    "user7|": 1642,  # peekitem(7)
    "user8|": 1642,
    "user9|": 1639,
}

PERFS = {
    "user7": {variant: DEFAULT_PERF for variant in VARIANTS},
    "newplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
    "strongplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
    "weakplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
}
PERFS["user7"]["crazyhouse960"] = {
    "gl": {"r": 1642, "d": 125, "v": 0.06},
    "la": datetime.now(timezone.utc),
    "nb": 100,
}

PERFS["newplayer"]["crazyhouse960"] = {
    "gl": {"r": 1500, "d": 136, "v": 0.06},
    "la": datetime.now(timezone.utc),
    "nb": 100,
}

PERFS["strongplayer"]["crazyhouse960"] = {
    "gl": {"r": 1500, "d": 350, "v": 0.06},
    "la": datetime.now(timezone.utc),
    "nb": 100,
}

PERFS["weakplayer"]["crazyhouse960"] = {
    "gl": {"r": 1450, "d": 350, "v": 0.06},
    "la": datetime.now(timezone.utc),
    "nb": 100,
}

CLOCKS = [60, 60]


class GameResultTestCase(AioHTTPTestCase):
    async def startup(self, app):
        self.bplayer = User(get_app_state(self.app), username="bplayer", perfs=PERFS["newplayer"])
        self.wplayer = User(get_app_state(self.app), username="wplayer", perfs=PERFS["newplayer"])

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_bughouse_checkmate(self):
        FEN = "r1b2Q2/ppp4p/1kn5/1q3N2/8/2P5/P1PK1q~1P/1R6[Npp] w - - 0 33 | 1r1k3r/pPpn2pp/4Qn2/3p4/2pNP3/1Bb5/PPPP1PPP/R1B1K2R[RBBNPPPqrbbnppp] w KQ - 1 19"
        game = GameBug(
            get_app_state(self.app),
            "12345678",
            "bughouse",
            FEN,
            self.wplayer,
            self.wplayer,
            self.bplayer,
            self.bplayer,
            rated=False,
        )

        await game.play_move("d4c6", board="b", clocks=CLOCKS, clocks_b=CLOCKS)

        self.assertEqual(game.result, "0-1")
        self.assertEqual(game.status, MATE)

    async def test_atomic_stalemate(self):
        FEN = "K7/Rk6/2B5/8/8/8/7Q/8 w - - 0 1"
        game = Game(
            get_app_state(self.app),
            "12345678",
            "atomic",
            FEN,
            self.wplayer,
            self.bplayer,
            rated=False,
        )
        await game.play_move("h2b8", clocks=CLOCKS)

        self.assertEqual(game.result, "1/2-1/2")
        self.assertEqual(game.status, STALEMATE)

    async def test_atomic_checkmate(self):
        FEN = "B6Q/Rk6/8/8/8/8/8/4K3 w - - 0 1"
        game = Game(
            get_app_state(self.app),
            "12345678",
            "atomic",
            FEN,
            self.wplayer,
            self.bplayer,
            rated=False,
        )
        await game.play_move("h8b8", clocks=CLOCKS)

        self.assertEqual(game.result, "1-0")
        self.assertEqual(game.status, MATE)

    async def test_janggi_flag_0(self):
        game = Game(get_app_state(self.app), "12345678", "janggi", "", self.wplayer, self.bplayer)
        await game.game_ended(self.bplayer, "flag")

        self.assertEqual(game.result, "1-0")

    async def test_janggi_flag_1(self):
        game = Game(get_app_state(self.app), "12345678", "janggi", "", self.wplayer, self.bplayer)
        game.bsetup = False
        await game.game_ended(self.wplayer, "flag")

        self.assertEqual(game.result, "0-1")

    async def test_janggi_flag_2(self):
        game = Game(get_app_state(self.app), "12345678", "janggi", "", self.wplayer, self.bplayer)
        game.bsetup = False
        game.wsetup = False
        await game.game_ended(self.wplayer, "flag")

        self.assertEqual(game.result, "0-1")

    async def test_janggi_flag_3(self):
        game = Game(get_app_state(self.app), "12345678", "janggi", "", self.wplayer, self.bplayer)
        game.bsetup = False
        game.wsetup = False
        await game.game_ended(self.bplayer, "flag")

        self.assertEqual(game.result, "1-0")


class SanitizeFenTestCase(unittest.TestCase):
    def test_fen_default(self):
        for variant in VARIANTS:
            chess960 = variant.endswith("960")
            variant_name = variant[:-3] if chess960 else variant
            board = FairyBoard(variant_name, chess960=chess960)
            fen = board.initial_fen
            print()
            print(variant_name, chess960, fen)

            valid, sanitized = sanitize_fen(variant_name, fen, chess960)
            self.assertTrue(valid)

    def test_fen_lichess_zh_pockets(self):
        chess960 = False
        lichess_fen = "r7/5pkp/b1pPpNpn/p2pP3/N7/BP6/KP3PPP/r3q~3/RQNRPQBb w - - 2 51"
        pychess_fen = "r7/5pkp/b1pPpNpn/p2pP3/N7/BP6/KP3PPP/r3q~3[RQNRPQBb] w - - 2 51"
        valid, sanitized = sanitize_fen("crazyhouse", lichess_fen, chess960)
        self.assertEqual(sanitized, pychess_fen)

    def test_fen_slashes(self):
        chess960 = False
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/ w KQkq - 0 1"
        valid, sanitized = sanitize_fen("chess", fen, chess960)
        self.assertFalse(valid)

    def test_fen_castling_rights(self):
        chess960 = False
        # missing h1 rook
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w KQkq - 0 1"
        valid, sanitized = sanitize_fen("chess", fen, chess960)
        self.assertFalse(valid)

        # https://www.pychess.org/xYbsTWKM
        fen = "rnbqk1nr/1ppp1ppp/1pb1p3/7e/1b2P3/2NP1N2/PPPQBPPP/R2EK2R[HH] w KQAEHkqabcdegh - 4 9"
        valid, sanitized = sanitize_fen("shouse", fen, chess960)
        self.assertTrue(valid)

    def test_fen_opp_king_in_check(self):
        chess960 = False
        fen = "5k3/4a4/3CN4/9/1PP5p/9/8P/4C4/4A4/2B1K4 w - - 0 46"
        valid, sanitized = sanitize_fen("janggi", fen, chess960)
        self.assertFalse(valid)


class RequestLobbyTestCase(AioHTTPTestCase):
    async def tearDownAsync(self):
        app_state = get_app_state(self.app)
        for user in app_state.users.values():
            if user.anon and not reserved(user.username):
                user.remove_task.cancel()

        await self.client.close()

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def test_example(self):
        resp = await self.client.request("GET", "/")
        self.assertEqual(resp.status, 200)
        text = await resp.text()
        self.assertIn("<title>PyChess", text)


class HighscoreTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        app_state.highscore = {variant: ValueSortedDict(neg) for variant in VARIANTS}
        app_state.highscore["crazyhouse960"] = ValueSortedDict(neg, ZH960)

        self.wplayer = User(app_state, username="user7", perfs=PERFS["user7"])
        self.bplayer = User(app_state, username="newplayer", perfs=PERFS["newplayer"])
        self.strong_player = User(app_state, username="strongplayer", perfs=PERFS["strongplayer"])
        self.weak_player = User(app_state, username="weakplayer", perfs=PERFS["weakplayer"])

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    @staticmethod
    def print_game_highscore(game):
        # return
        print("----")
        print(game.wplayer.perfs["crazyhouse960"])
        print(game.bplayer.perfs["crazyhouse960"])
        for row in game.app_state.highscore["crazyhouse960"].items():
            print(row)

    async def play_and_resign(self, game, player):
        clocks = (game.clocks_w[0], game.clocks_b[0])
        for i, move in enumerate(("e2e4", "e7e5", "f2f4"), start=1):
            await game.play_move(move, clocks=clocks, ply=i)
        await game.game_ended(player, "resign")

    async def test_lost_but_still_there(self):
        game_id = id8()
        game = Game(
            get_app_state(self.app),
            game_id,
            "crazyhouse",
            "",
            self.wplayer,
            self.bplayer,
            rated=True,
            chess960=True,
            create=True,
        )
        app_state = get_app_state(self.app)
        app_state.games[game.id] = game
        self.assertEqual(game.status, CREATED)
        self.assertEqual(len(game.crosstable["r"]), 0)

        self.print_game_highscore(game)
        highscore0 = game.app_state.highscore["crazyhouse960"].peekitem(7)

        # wplayer resign 0-1
        await self.play_and_resign(game, self.wplayer)

        self.print_game_highscore(game)
        highscore1 = game.app_state.highscore["crazyhouse960"].peekitem(7)

        self.assertEqual(len(game.crosstable["r"]), 1)
        self.assertNotEqual(highscore0, highscore1)
        self.assertTrue(self.wplayer.username + "|" in game.app_state.highscore["crazyhouse960"])

    async def test_lost_and_out(self):
        game_id = id8()
        game = Game(
            get_app_state(self.app),
            game_id,
            "crazyhouse",
            "",
            self.wplayer,
            self.strong_player,
            rated=True,
            chess960=True,
            create=True,
        )
        app_state = get_app_state(self.app)
        app_state.games[game.id] = game
        self.assertEqual(game.status, CREATED, msg="status not equal to CREATED")
        self.assertEqual(len(game.crosstable["r"]), 0, msg="game.crosstable not empty")

        self.print_game_highscore(game)
        highscore0 = game.app_state.highscore["crazyhouse960"].peekitem(7)

        # wplayer resign 0-1
        await self.play_and_resign(game, self.wplayer)

        self.print_game_highscore(game)
        highscore1 = game.app_state.highscore["crazyhouse960"].peekitem(7)

        self.assertEqual(len(game.crosstable["r"]), 1, msg="game.crosstable still empty")
        self.assertNotEqual(highscore0, highscore1, msg="highscore not changed")
        self.assertTrue(
            self.wplayer.username + "|"
            not in game.app_state.highscore["crazyhouse960"].keys()[:10],
            msg="wplayer not in highscore",
        )

    async def test_win_and_in_then_lost_and_out(self):
        game_id = id8()
        game = Game(
            get_app_state(self.app),
            game_id,
            "crazyhouse",
            "",
            self.strong_player,
            self.weak_player,
            rated=True,
            chess960=True,
            create=True,
        )
        app_state = get_app_state(self.app)
        app_state.games[game.id] = game
        self.assertEqual(game.status, CREATED)
        self.assertEqual(len(game.crosstable["r"]), 0)

        self.print_game_highscore(game)

        # weak_player resign 1-0
        await self.play_and_resign(game, self.weak_player)

        self.print_game_highscore(game)

        self.assertEqual(len(game.crosstable["r"]), 1)
        print(game.crosstable)
        self.assertTrue(
            self.weak_player.username + "|"
            not in game.app_state.highscore["crazyhouse960"].keys()[:10]
        )
        self.assertTrue(
            self.strong_player.username + "|"
            in game.app_state.highscore["crazyhouse960"].keys()[:10]
        )

        # now strong player will lose to weak_player and should be out from leaderboard
        game_id = id8()
        game = Game(
            get_app_state(self.app),
            game_id,
            "crazyhouse",
            "",
            self.strong_player,
            self.weak_player,
            rated=True,
            chess960=True,
            create=True,
        )
        app_state.games[game.id] = game

        doc = await game.app_state.db.crosstable.find_one({"_id": game.ct_id})
        if doc is not None:
            game.crosstable = doc
        print(game.crosstable)

        # strong_player resign 0-1
        await self.play_and_resign(game, self.strong_player)

        self.print_game_highscore(game)

        print(game.crosstable)
        self.assertEqual(len(game.crosstable["r"]), 2)
        self.assertTrue(
            self.weak_player.username + "|"
            not in game.app_state.highscore["crazyhouse960"].keys()[:10]
        )
        self.assertTrue(
            self.strong_player.username + "|"
            not in game.app_state.highscore["crazyhouse960"].keys()[:10]
        )


class RatingTestCase(AioHTTPTestCase):
    async def startup(self, app):
        self.gl2 = Glicko2(tau=0.5)

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_new_rating(self):
        # New User ratings are equals to default

        default_rating = self.gl2.create_rating()

        user = User(
            get_app_state(self.app),
            username="testuser",
            perfs={variant: DEFAULT_PERF for variant in VARIANTS},
        )
        result = user.get_rating("chess", False)

        self.assertEqual(result.mu, default_rating.mu)

    async def test_rating(self):
        # New Glicko2 rating calculation example from original paper

        u1 = User(
            get_app_state(self.app),
            username="testuser1",
            perfs={
                "chess": {
                    "la": datetime.now(timezone.utc),
                    "gl": {"r": 1500, "d": 200, "v": 0.06},
                }
            },
        )
        r1 = u1.get_rating("chess", False)

        self.assertEqual(r1.mu, 1500)
        self.assertEqual(r1.phi, 200)
        self.assertEqual(r1.sigma, 0.06)

        u2 = User(
            get_app_state(self.app),
            username="testuser2",
            perfs={
                "chess": {
                    "la": datetime.now(timezone.utc),
                    "gl": {"r": 1400, "d": 30, "v": 0.06},
                }
            },
        )
        r2 = u2.get_rating("chess", False)
        self.assertEqual(r2.mu, 1400)

        u3 = User(
            get_app_state(self.app),
            username="testuser3",
            perfs={
                "chess": {
                    "la": datetime.now(timezone.utc),
                    "gl": {"r": 1550, "d": 100, "v": 0.06},
                }
            },
        )
        r3 = u3.get_rating("chess", False)
        self.assertEqual(r3.mu, 1550)

        u4 = User(
            get_app_state(self.app),
            username="testuser4",
            perfs={
                "chess": {
                    "la": datetime.now(timezone.utc),
                    "gl": {"r": 1700, "d": 300, "v": 0.06},
                }
            },
        )
        r4 = u4.get_rating("chess", False)
        self.assertEqual(r4.mu, 1700)

        new_rating = self.gl2.rate(r1, [(WIN, r2), (LOSS, r3), (LOSS, r4)])

        self.assertEqual(round(new_rating.mu, 3), 1464.051)
        self.assertEqual(round(new_rating.phi, 3), 151.517)
        self.assertEqual(round(new_rating.sigma, 6), 0.059996)

        await u1.set_rating("chess", False, new_rating)

        r1 = u1.get_rating("chess", False)

        self.assertEqual(round(r1.mu, 3), 1464.051)
        self.assertEqual(round(r1.phi, 3), 151.517)
        self.assertEqual(round(r1.sigma, 6), 0.059996)


class FirstRatedGameTestCase(AioHTTPTestCase):
    async def startup(self, app):
        self.bplayer1 = User(get_app_state(self.app), username="bplayer", perfs=PERFS["newplayer"])
        self.wplayer1 = User(get_app_state(self.app), username="wplayer", perfs=PERFS["newplayer"])

        self.bplayer2 = User(get_app_state(self.app), username="bplayer", perfs=PERFS["newplayer"])
        self.wplayer2 = User(get_app_state(self.app), username="wplayer", perfs=PERFS["newplayer"])

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_ratings(self):
        game = Game(
            get_app_state(self.app),
            "12345678",
            "chess",
            "",
            self.wplayer1,
            self.bplayer1,
            rated=True,
        )
        game.board.ply = 3
        await game.game_ended(self.bplayer1, "flag")

        rw = self.wplayer1.get_rating("chess", False)
        rb = self.bplayer1.get_rating("chess", False)

        self.assertEqual(round(rw.mu, 3), 1662.212)
        self.assertEqual(round(rb.mu, 3), 1337.788)

        game = Game(
            get_app_state(self.app),
            "12345678",
            "chess",
            "",
            self.wplayer2,
            self.bplayer2,
            rated=True,
        )
        game.board.ply = 3
        await game.game_ended(self.wplayer2, "flag")

        rw = self.wplayer2.get_rating("chess", False)
        rb = self.bplayer2.get_rating("chess", False)

        self.assertEqual(round(rb.mu, 3), 1662.212)
        self.assertEqual(round(rw.mu, 3), 1337.788)


if __name__ == "__main__":
    unittest.main(verbosity=2)
