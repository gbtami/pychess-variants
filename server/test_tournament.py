# -*- coding: utf-8 -*-

import asyncio
import random
import unittest
from datetime import datetime, timezone

from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

from const import STARTED, VARIANTS
from glicko2.glicko2 import DEFAULT_PERF
from server import make_app
from user import User
from tournament import new_tournament_id, Tournament, T_CREATED, T_STARTED, T_FINISHED, ARENA, RR, SWISS
import game

game.KEEP_TIME = 0
game.MAX_PLY = 120

MAX_PLY = game.MAX_PLY
PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


def score(game, player):
    if game is None:
        return "-"
    elif game.result == "1/2-1/2":
        return "½"
    elif game.result == "1-0":
        return "1" if player == game.wplayer else "0"
    elif game.result == "0-1":
        return "1" if player == game.bplayer else "0"
    else:
        return "*"


class TestTournament(Tournament):

    async def create_new_pairings(self):
        self.print_leaderboard()

        pairing, games = await Tournament.create_new_pairing(self)

        # aouto play test games
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print("--- new pairings at %s ---" % now)
        for wp, bp in pairing:
            print("%s - %s" % (wp.username, bp.username))
        print("---")

        for game in games:
            game.random_mover = True
            self.game_tasks.add(asyncio.create_task(self.play_random(game)))

    def print_leaderboard(self):
        print("--- LEADERBOARD ---")
        for player, full_score in self.leaderboard.items():
            scores = [score(game, player) for game in self.players[player].games]
            print("%10s %s %s" % (player.username, scores, full_score))

    def print_final_result(self):
        if len(self.players) > 0:
            self.print_leaderboard()
        else:
            return

        print("--- TOURNAMENT RESULT ---")
        for i in range(3):
            player = self.leaderboard.peekitem(i)[0]
            print("--- #%s ---" % (i + 1), player.username)

    def print_player_games(self, player):
        for game in self.players[player].games:
            if game is None:
                print("-")
            else:
                color = "w" if game.wplayer == player else "b"
                opp_player = game.bplayer if color == "w" else game.wplayer
                opp_rating = game.black_rating if color == "w" else game.white_rating
                opp_rating = int(round(opp_rating.mu, 0))
                print(opp_player.username, opp_rating, color, game.result)

    async def play_random(self, game):
        """ Play random moves in test tournament games """
        await asyncio.sleep(random.choice((0, 1, 3, 5, 7)))
        while game.status <= STARTED:
            game.set_dests()
            move = game.random_move
            await game.play_move(move, clocks={"white": 60, "black": 60})
            ply = random.randint(4, int(MAX_PLY / 2))
            if game.board.ply == ply and (ply % 2) == random.randint(0, 1):
                player = game.wplayer if ply % 2 == 0 else game.bplayer
                await game.game_ended(player, "resign")
                print(game.result, "resign")


class TournamentTestCase(AioHTTPTestCase):

    async def tearDownAsync(self):
        self.tournament.print_final_result()

        has_games = len(self.app["games"]) > 0

        for game in self.app["games"].values():
            await game.abort()
            game.remove_task.cancel()
            try:
                await game.remove_task
            except asyncio.CancelledError:
                pass

        if has_games:
            for task in self.tournament.game_tasks:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    async def get_application(self):
        app = make_app(with_db=False)
        return app

    @unittest_run_loop
    async def test_tournament_without_players(self):
        # 2s tournament with 1s waiting before start
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, "Test Tournament", "crazyhouse", before_start=1.0 / 60.0, duration=2.0 / 60.0)
        self.assertEqual(self.tournament.status, T_CREATED)

        await asyncio.sleep((self.tournament.before_start * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_STARTED)

        await asyncio.sleep((self.tournament.duration * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_FINISHED)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_players(self):
        # tournament with 15 -1 players
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, "Test Tournament", "crazyhouse", before_start=0, duration=1.0 / 60.0)
        for i in range(15):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)
            self.tournament.pause(player)
        self.assertEqual(len(self.tournament.leaderboard), 15)

        withdrawn_player = next(iter(self.tournament.players))
        self.tournament.withdraw(withdrawn_player)
        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_pairing_5_round_SWISS(self):
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, "Test Tournament", "crazyhouse", before_start=0, pairing=SWISS, rounds=5)
        self.tournament.game_tasks = set()
        for i in range(15):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_pairing_1_min_ARENA(self):
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, "Test Tournament", "crazyhouse", before_start=0, duration=1, pairing=ARENA)
        self.tournament.game_tasks = set()
        for i in range(15):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_pairing_5_round_RR(self):
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, "Test Tournament", "crazyhouse", before_start=0, pairing=RR, rounds=5)
        self.tournament.game_tasks = set()
        for i in range(5):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)

        await self.tournament.clock_task


if __name__ == '__main__':
    unittest.main(verbosity=2)
