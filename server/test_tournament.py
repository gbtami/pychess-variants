# -*- coding: utf-8 -*-

import asyncio
import random
import unittest
from datetime import datetime, timezone

from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

from const import STARTED, VARIANTS
from fairy import BLACK
import game as game_modul
from glicko2.glicko2 import DEFAULT_PERF
from server import make_app
from user import User
from tournament import new_tournament_id, Tournament, T_CREATED, T_STARTED, T_FINISHED, ARENA, RR, SWISS

game_modul.MAX_PLY = 120

MAX_PLY = game_modul.MAX_PLY
PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


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
        print("--- LEADERBOARD ---", self.id)
        for player, full_score in self.leaderboard.items():
            print("%20s %s %s" % (player.username, self.players[player].points, full_score))

    def print_final_result(self):
        if len(self.players) > 0:
            self.print_leaderboard()
        else:
            return

        print("--- TOURNAMENT RESULT ---")
        for i in range(3):
            player = self.leaderboard.peekitem(i)[0]
            print("--- #%s ---" % (i + 1), player.username)

    async def play_random(self, game):
        """ Play random moves in test tournament games """
        if self.system == ARENA:
            await asyncio.sleep(random.choice((0, 1, 3, 5, 7)))

        game.status = STARTED
        print("play_random()")
        while game.status <= STARTED:
            cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
            if cur_player.title == "TEST":
                game.set_dests()
                move = game.random_move
                await game.play_move(move, clocks={"white": 60, "black": 60})
                ply = random.randint(4, int(MAX_PLY / 2))
                if game.board.ply == ply:
                    player = game.wplayer if ply % 2 == 0 else game.bplayer
                    await game.game_ended(player, "resign")
                    print(game.result, "resign")
            else:
                await asyncio.sleep(1)


def create_arena_test(app):
    tid = "12345678"
    tournament = TestTournament(app, tid, before_start=0.1, minutes=5)
    app["tournaments"][tid] = tournament

    tournament.game_tasks = set()
    for i in range(15):
        player = User(app, username="player%s" % i, title="TEST", perfs=PERFS)
        app["users"][player.username] = player
        player.tournament_sockets.add(None)
        tournament.join(player)


class TournamentTestCase(AioHTTPTestCase):

    async def tearDownAsync(self):
        self.tournament.print_final_result()

        has_games = len(self.app["games"]) > 0

        for game in self.app["games"].values():
            if game.status <= STARTED:
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
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, before_start=1.0 / 60.0, minutes=2.0 / 60.0)
        self.assertEqual(self.tournament.status, T_CREATED)

        await asyncio.sleep((self.tournament.before_start * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_STARTED)

        await asyncio.sleep((self.tournament.minutes * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_FINISHED)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_players(self):
        NB_PLAYERS = 15
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, before_start=0, minutes=1.0 / 60.0)
        for i in range(NB_PLAYERS):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)
            self.tournament.pause(player)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS)

        withdrawn_player = next(iter(self.tournament.players))
        self.tournament.withdraw(withdrawn_player)

        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)
        self.assertEqual(len(self.tournament.players), NB_PLAYERS - 1)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS - 1)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest_run_loop
    async def test_tournament_pairing_5_round_SWISS(self):
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, before_start=0, system=SWISS, rounds=NB_ROUNDS)
        self.tournament.game_tasks = set()
        for i in range(NB_PLAYERS):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])

    @unittest_run_loop
    async def test_tournament_pairing_1_min_ARENA(self):
        NB_PLAYERS = 15
        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, before_start=0, minutes=1)
        self.tournament.game_tasks = set()
        for i in range(NB_PLAYERS):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.app["users"][player.username] = player
            self.tournament.join(player)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest_run_loop
    async def test_tournament_pairing_5_round_RR(self):
        NB_PLAYERS = 5
        NB_ROUNDS = 5

        tid = await new_tournament_id(self.app["db"])
        self.tournament = TestTournament(self.app, tid, before_start=0, system=RR, rounds=NB_ROUNDS)
        self.tournament.game_tasks = set()
        for i in range(NB_PLAYERS):
            player = User(self.app, username="player%s" % i, perfs=PERFS)
            self.tournament.join(player)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])


if __name__ == '__main__':
    unittest.main(verbosity=2)
