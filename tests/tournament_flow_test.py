# -*- coding: utf-8 -*-

import asyncio
import unittest
from datetime import datetime, timezone

from const import T_CREATED, T_FINISHED, T_STARTED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_arena import (
    ArenaTestTournament,
    RRTestTournament,
    SwissTestTournament,
)
from tournament.tournament import upsert_tournament_to_db
from tournament_test_base import ONE_TEST_ONLY, TournamentTestCase


class TournamentFlowTestCase(TournamentTestCase):
    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_without_players(self):
        app_state = get_app_state(self.app)
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
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, before_start=0, minutes=0, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS)

        withdrawn_player = next(iter(self.tournament.players))
        await self.tournament.withdraw(withdrawn_player)

        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)
        self.assertEqual(len(self.tournament.players), NB_PLAYERS)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS - 1)

        self.assertEqual(self.tournament.status, T_CREATED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_with_3_active_players(self):
        app_state = get_app_state(self.app)
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

    async def test_tournament_rating_update_on_rejoin(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=1, minutes=1
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        player = list(self.tournament.players.keys())[0]
        initial_rating = self.tournament.players[player].rating

        await self.tournament.withdraw(player)

        # Simulate rating change
        new_rating = initial_rating + 100
        player.perfs["chess"]["gl"]["r"] = new_rating

        await self.tournament.join(player)

        self.assertEqual(self.tournament.players[player].rating, new_rating)

        await self.tournament.clock_task

    async def test_tournament_sorting_before_start(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=1, minutes=1
        )
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(3)

        players_json = self.tournament.players_json()
        leaderboard_ratings = [p["rating"] for p in players_json["players"]]

        self.assertEqual(leaderboard_ratings, sorted(leaderboard_ratings, reverse=True))

        # Add a new player with a higher rating
        await self.tournament.join_players(1, rating=2000)

        players_json = self.tournament.players_json()
        leaderboard_ratings = [p["rating"] for p in players_json["players"]]
        self.assertEqual(leaderboard_ratings, sorted(leaderboard_ratings, reverse=True))

        await self.tournament.clock_task

    async def test_withdraw_after_start_pauses(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(2)
        player = list(self.tournament.players.keys())[0]
        await self.tournament.start(datetime.now(timezone.utc))

        await self.tournament.withdraw(player)

        player_data = self.tournament.players[player]
        self.assertTrue(player_data.paused)
        self.assertFalse(player_data.withdrawn)
        self.assertEqual(self.tournament.nb_players, 2)
        self.assertIn(player, self.tournament.leaderboard)

        doc = await app_state.db.tournament_player.find_one({"_id": player_data.id})
        self.assertTrue(doc["a"])
        self.assertFalse(doc.get("wd", False))
