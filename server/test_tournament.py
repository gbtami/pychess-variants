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
from newid import id8
from server import make_app
from user import User
from tournament import insert_tournament_to_db, Tournament, T_CREATED, T_STARTED, T_FINISHED, ARENA, RR, SWISS
from utils import play_move
from misc import timeit

game_modul.MAX_PLY = 120

MAX_PLY = game_modul.MAX_PLY
PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


class TestTournament(Tournament):

    def join_players(self, nb_players):
        self.game_tasks = set()

        for i in range(nb_players):
            player = User(self.app, username="player%s" % i, title="TEST", perfs=PERFS)
            self.app["users"][player.username] = player
            player.tournament_sockets.add(None)
            self.join(player)

    async def create_new_pairings(self):
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print("--- new pairings at %s ---" % now)
        self.print_leaderboard()
        pairing, games = await Tournament.create_new_pairing(self)

        # aouto play test games
        # for wp, bp in pairing:
        #     print("%s - %s" % (wp.username, bp.username))
        print("--- done ---")

        for game in games:
            game.random_mover = True
            self.game_tasks.add(asyncio.create_task(self.play_random(game)))

    def print_leaderboard(self):
        print("--- LEADERBOARD ---", self.id)
        for player, full_score in self.leaderboard.items()[:10]:
            print("%20s %4s %30s %2s %s" % (
                player.username,
                self.players[player].rating,
                self.players[player].points,
                int(full_score / 100000),
                self.players[player].performance
            ))

    def print_final_result(self):
        if len(self.players) > 0:
            self.print_leaderboard()
        else:
            return

        print("--- TOURNAMENT RESULT ---")
        for i in range(3):
            player = self.leaderboard.peekitem(i)[0]
            print("--- #%s ---" % (i + 1), player.username)

    @timeit
    async def play_random(self, game):
        """ Play random moves for TEST players """
        if self.system == ARENA:
            await asyncio.sleep(random.choice((0, 1, 3, 5, 7)))

        game.status = STARTED
        while game.status <= STARTED:
            cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
            opp_player = game.wplayer if game.board.color == BLACK else game.bplayer
            if cur_player.title == "TEST":
                ply = random.randint(4, int(MAX_PLY / 2))
                if game.board.ply == ply:
                    player = game.wplayer if ply % 2 == 0 else game.bplayer
                    response = await game.game_ended(player, "resign")
                    # print(game.result, "resign")
                    if opp_player.title != "TEST":
                        opp_ws = opp_player.game_sockets[game.id]
                        await opp_ws.send_json(response)
                else:
                    game.set_dests()
                    move = game.random_move
                    clocks = {
                        "white": game.ply_clocks[-1]["white"],
                        "black": game.ply_clocks[-1]["white"],
                        "movetime": 0
                    }
                    await play_move(self.app, cur_player, game, move, clocks=clocks)
            else:
                await asyncio.sleep(1)


async def create_arena_test(app):
    tid = "12345678"
    await app["db"].tournament.delete_one({"_id": tid})
    await app["db"].tournament_player.delete_many({"tid": tid})
    await app["db"].tournament_leaderboard.delete_many({"tid": tid})
    await app["db"].tournament_pairing.delete_many({"tid": tid})

    tournament = TestTournament(app, tid, variant="minixiangqi", name="First Minixiangqi Arena", before_start=0.1, minutes=1)
    app["tournaments"][tid] = tournament

    await insert_tournament_to_db(tournament, app)

    tournament.join_players(107)


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
        self.app["db"] = None
        tid = id8()
        self.tournament = TestTournament(self.app, tid, before_start=1.0 / 60.0, minutes=2.0 / 60.0)
        self.app["tournaments"][tid] = self.tournament

        self.assertEqual(self.tournament.status, T_CREATED)

        await asyncio.sleep((self.tournament.before_start * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_STARTED)

        await asyncio.sleep((self.tournament.minutes * 60) + 0.1)
        self.assertEqual(self.tournament.status, T_FINISHED)

        await self.tournament.clock_task

    @unittest_run_loop
    async def test_tournament_players(self):
        self.app["db"] = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = TestTournament(self.app, tid, before_start=0, minutes=0)
        self.app["tournaments"][tid] = self.tournament
        self.tournament.join_players(NB_PLAYERS)

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
        self.app["db"] = None
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = TestTournament(self.app, tid, before_start=0, system=SWISS, rounds=NB_ROUNDS)
        self.app["tournaments"][tid] = self.tournament
        self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])

    @unittest_run_loop
    async def test_tournament_pairing_1_min_ARENA(self):
        self.app["db"] = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = TestTournament(self.app, tid, before_start=0, minutes=0.5)
        self.app["tournaments"][tid] = self.tournament
        self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest_run_loop
    async def test_tournament_pairing_5_round_RR(self):
        self.app["db"] = None
        NB_PLAYERS = 5
        NB_ROUNDS = 5

        tid = id8()
        self.tournament = TestTournament(self.app, tid, before_start=0, system=RR, rounds=NB_ROUNDS)
        self.app["tournaments"][tid] = self.tournament
        self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])


if __name__ == '__main__':
    unittest.main(verbosity=2)
