# -*- coding: utf-8 -*-

import asyncio
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import (
    BYEGAME,
    STARTED,
    T_CREATED,
    T_STARTED,
    T_FINISHED,
)
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from tournament.auto_play_arena import (
    ArenaTestTournament,
    SwissTestTournament,
    RRTestTournament,
)

import logging

log = logging.getLogger(__name__)

ONE_TEST_ONLY = False


class TournamentTestCase(AioHTTPTestCase):
    async def tearDownAsync(self):
        app_state = get_app_state(self.app)
        has_games = len(app_state.games) > 0

        for game in app_state.games.values():
            if game.status == BYEGAME:  # ByeGame
                continue
            if game.status <= STARTED:
                await game.abort_by_server()

            if game.remove_task is not None:
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

        await self.client.close()

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_without_players(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        tid = id8()
        self.tournament = ArenaTestTournament(app_state, tid, before_start=0, minutes=2.0 / 60.0)
        app_state.tournaments[tid] = self.tournament

        self.assertEqual(self.tournament.status, T_CREATED)

        await asyncio.sleep(0.1)
        self.assertEqual(self.tournament.status, T_STARTED)

        await asyncio.sleep(3)
        self.assertEqual(self.tournament.status, T_FINISHED)

        await self.tournament.clock_task

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_players(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(app_state, tid, before_start=0, minutes=0)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS)

        withdrawn_player = next(iter(self.tournament.players))
        await self.tournament.withdraw(withdrawn_player)

        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)
        self.assertEqual(len(self.tournament.players), NB_PLAYERS)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS - 1)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_with_3_active_players(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(app_state, tid, before_start=0.1, minutes=1)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        # 12 player leave the tournament lobby
        for i in range(12):
            print(i)
            del list(self.tournament.players.keys())[i].tournament_sockets[self.tournament.id]
        self.assertEqual(len(self.tournament.waiting_players()), NB_PLAYERS - 12)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

        for user in self.tournament.players:
            self.assertTrue(self.tournament.players[user].nb_not_paired <= 1)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_5_round_SWISS(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=NB_ROUNDS)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_1_min_ARENA(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(app_state, tid, before_start=0.1, minutes=1)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        # withdraw one player
        await self.tournament.withdraw(list(self.tournament.players.keys())[-1])
        self.assertEqual(self.tournament.nb_players, NB_PLAYERS - 1)

        # make the first player leave the tournament lobby
        del list(self.tournament.players.keys())[0].tournament_sockets[self.tournament.id]

        self.assertEqual(len(self.tournament.waiting_players()), NB_PLAYERS - 2)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_5_round_RR(self):
        app_state = get_app_state(self.app)
        # app_state.db = None
        NB_PLAYERS = 5
        NB_ROUNDS = 5

        tid = id8()
        self.tournament = RRTestTournament(app_state, tid, before_start=0, rounds=NB_ROUNDS)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
