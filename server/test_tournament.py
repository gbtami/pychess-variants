# -*- coding: utf-8 -*-

import asyncio
import collections
import random
import unittest
from datetime import datetime, timezone

from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

from const import BYEGAME, STARTED, VARIANTS, ARENA, RR, SWISS, T_CREATED, T_STARTED, T_FINISHED
from fairy import BLACK
from game import MAX_PLY
from glicko2.glicko2 import DEFAULT_PERF
from newid import id8
from server import make_app
from user import User
from tournament import Tournament
from tournaments import upsert_tournament_to_db, new_tournament
from arena import ArenaTournament
from rr import RRTournament
from swiss import SwissTournament
from utils import draw, play_move
# from misc import timeit

PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}


class TestTournament(Tournament):

    async def join_players(self, nb_players):
        self.game_tasks = set()

        for i in range(nb_players):
            name = (id8() + id8())[:random.randint(1, 16)]
            player = User(self.app, username=name, title="TEST", perfs=PERFS)
            self.app["users"][player.username] = player
            player.tournament_sockets[self.id] = set((None,))
            await self.join(player)

    async def create_new_pairings(self, waiting_players):
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print("--- create_new_pairings at %s ---" % now)
        self.print_leaderboard()
        pairing, games = await Tournament.create_new_pairings(self, waiting_players)

        # aouto play test games
        # for wp, bp in pairing:
        #     print("%s - %s" % (wp.username, bp.username))
        print("--- create_new_pairings done ---")

        for game in games:
            if game.status == BYEGAME:  # ByeGame
                continue
            self.app["games"][game.id] = game
            game.random_mover = True
            self.game_tasks.add(asyncio.create_task(self.play_random(game)))

    # @timeit
    async def play_random(self, game):
        """ Play random moves for TEST players """
        if game.status == BYEGAME:  # ByeGame
            return

        if self.system == ARENA:
            await asyncio.sleep(random.choice((0, 0.1, 0.3, 0.5, 0.7)))

        game.status = STARTED
        while game.status <= STARTED:
            cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
            opp_player = game.wplayer if game.board.color == BLACK else game.bplayer
            if cur_player.title == "TEST":
                ply = random.randint(20, int(MAX_PLY / 10))
                if game.board.ply == ply or game.board.ply > 60:
                    player = game.wplayer if ply % 2 == 0 else game.bplayer
                    if game.board.ply > 60:
                        response = await draw(self.app["games"], {"gameId": game.id}, agreement=True)
                    else:
                        response = await game.game_ended(player, "resign")
                    if opp_player.title != "TEST":
                        opp_ws = opp_player.game_sockets[game.id]
                        await opp_ws.send_json(response)
                else:
                    game.set_dests()
                    move = game.random_move
                    clocks = {
                        "white": game.ply_clocks[-1]["white"],
                        "black": game.ply_clocks[-1]["black"],
                        "movetime": 0
                    }
                    await play_move(self.app, cur_player, game, move, clocks=clocks)
            await asyncio.sleep(0.1)


class ArenaTestTournament(TestTournament, ArenaTournament):
    system = ARENA

    def create_pairing(self, waiting_players):
        return ArenaTournament.create_pairing(self, waiting_players)


class RRTestTournament(TestTournament, RRTournament):
    system = RR

    def create_pairing(self, waiting_players):
        return RRTournament.create_pairing(self, waiting_players)


class SwissTestTournament(TestTournament, SwissTournament):
    system = SWISS

    def create_pairing(self, waiting_players):
        return SwissTournament.create_pairing(self, waiting_players)


async def create_dev_arena_tournament(app):
    data = {
        "name": "3. zh960 test arena",
        "createdBy": "gbtami",
        "variant": "crazyhouse",
        "chess960": True,
        "base": 1,
        "inc": 1,
        "system": ARENA,
        "beforeStart": 15,
        "minutes": 25,
    }
    await new_tournament(app, data)


async def create_arena_test(app):
    tid = "12345678"
    await app["db"].tournament.delete_one({"_id": tid})
    await app["db"].tournament_player.delete_many({"tid": tid})
    await app["db"].tournament_pairing.delete_many({"tid": tid})

    tournament = ArenaTestTournament(app, tid, variant="crazyhouse", name="First zh960 Arena", chess960=True, before_start=5, minutes=20, created_by="PyChess")
#    tournament = SwissTestTournament(app, tid, variant="makpong", name="First Makpong Swiss", before_start=0.1, rounds=7, created_by="PyChess")
#    tournament = RRTestTournament(app, tid, variant="makpong", name="First Makpong RR", before_start=0.1, rounds=7, created_by="PyChess")
    app["tournaments"][tid] = tournament
    app["tourneysockets"][tid] = {}
    app["tourneychat"][tid] = collections.deque([], 100)

    await upsert_tournament_to_db(tournament, app)

#    await tournament.join_players(6)
    await tournament.join_players(19)


class TournamentTestCase(AioHTTPTestCase):

    async def tearDownAsync(self):
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
        self.tournament = ArenaTestTournament(self.app, tid, before_start=1.0 / 60.0, minutes=2.0 / 60.0)
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
        self.tournament = ArenaTestTournament(self.app, tid, before_start=0, minutes=0)
        self.app["tournaments"][tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS)

        withdrawn_player = next(iter(self.tournament.players))
        await self.tournament.withdraw(withdrawn_player)

        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)
        self.assertEqual(len(self.tournament.players), NB_PLAYERS)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS - 1)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest_run_loop
    async def test_tournament_pairing_5_round_SWISS(self):
        self.app["db"] = None
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = SwissTestTournament(self.app, tid, before_start=0, rounds=NB_ROUNDS)
        self.app["tournaments"][tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])

    @unittest_run_loop
    async def test_tournament_pairing_1_min_ARENA(self):
        self.app["db"] = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(self.app, tid, before_start=0.1, minutes=1)
        self.app["tournaments"][tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        # withdraw one player
        await self.tournament.withdraw(list(self.tournament.players.keys())[-1])
        self.assertEqual(self.tournament.nb_players, NB_PLAYERS - 1)

        # make the first player leave the tournament lobby
        del list(self.tournament.players.keys())[0].tournament_sockets[self.tournament.id]

        self.assertEqual(len(self.tournament.waiting_players()), NB_PLAYERS - 2)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest_run_loop
    async def test_tournament_pairing_5_round_RR(self):
        self.app["db"] = None
        NB_PLAYERS = 5
        NB_ROUNDS = 5

        tid = id8()
        self.tournament = RRTestTournament(self.app, tid, before_start=0, rounds=NB_ROUNDS)
        self.app["tournaments"][tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual([len(player.games) for player in self.tournament.players.values()], NB_PLAYERS * [NB_ROUNDS])


if __name__ == '__main__':
    unittest.main(verbosity=2)
