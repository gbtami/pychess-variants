# -*- coding: utf-8 -*-

import asyncio
import gc
import weakref
from datetime import datetime, timezone

from const import FLAG, RATED, TEST_PREFIX, T_STARTED
from newid import id8
from pychess_global_app_state import LOCALHOST_CACHE_KEEP_TIME, TOURNAMENT_KEEP_TIME
from pychess_global_app_state_utils import get_app_state
from settings import LOCALHOST, URI
from tournament.arena_new import ArenaTournament
from tournament.auto_play_arena import ArenaTestTournament, PERFS, SwissTestTournament
from tournament.tournament import ByeGame, GameData, PlayerData, upsert_tournament_to_db
from tournament.tournaments import load_tournament
from tournament_test_base import TournamentTestCase
from user import User


class TournamentPersistenceTestCase(TournamentTestCase):
    async def test_tournament_pairings_persist_before_restart(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.start(datetime.now(timezone.utc))
        await self.tournament.join_players(4)

        insert_started = asyncio.Event()
        insert_continue = asyncio.Event()
        original_insert = self.tournament.db_insert_pairing

        async def delayed_insert(games):
            insert_started.set()
            await insert_continue.wait()
            await original_insert(games)

        self.tournament.db_insert_pairing = delayed_insert

        waiting_players = self.tournament.waiting_players()
        pairing_task = asyncio.create_task(
            self.tournament.create_new_pairings(list(waiting_players))
        )
        await insert_started.wait()
        self.assertFalse(pairing_task.done())

        insert_continue.set()
        await pairing_task

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertIsNotNone(reloaded_tournament)
        self.assertGreater(len(reloaded_tournament.ongoing_games), 0)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_tournament_rejoin_persists_rating(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=10, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(1, rating=1500)
        player = list(self.tournament.players.keys())[0]
        player.perfs["chess"]["gl"]["r"] = 2000
        await self.tournament.join(player)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        player_data = next(iter(reloaded_tournament.players.values()))
        self.assertEqual(player_data.rating, 2000)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_tournament_current_round_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=1, minutes=1)
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(4)
        await self.tournament.clock_task

        doc = await app_state.db.tournament.find_one({"_id": tid})
        self.assertEqual(doc.get("cr"), 1)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertEqual(reloaded_tournament.current_round, 1)

    async def test_db_update_pairing_upserts(self):
        from game import Game

        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(2)
        players = list(self.tournament.players.keys())

        game = Game(
            app_state,
            id8(),
            "chess",
            "",
            players[0],
            players[1],
            rated=RATED,
            tournamentId=tid,
        )
        game.result = "1-0"
        game.wberserk = True

        await self.tournament.db_update_pairing(game)

        doc = await app_state.db.tournament_pairing.find_one({"_id": game.id})
        self.assertIsNotNone(doc)
        self.assertEqual(doc["r"], "a")
        self.assertTrue(doc["wb"])
        self.assertEqual(doc["u"], (players[0].username, players[1].username))

    async def test_load_tournament_repairs_stale_pairing(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        player_a = User(app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=PERFS)
        player_b = User(app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=PERFS)
        app_state.users[player_a.username] = player_a
        app_state.users[player_b.username] = player_b
        player_a.tournament_sockets[tid] = set((None,))
        player_b.tournament_sockets[tid] = set((None,))

        await self.tournament.join(player_a)
        await self.tournament.join(player_b)
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]

        await app_state.db.game.update_one(
            {"_id": game.id},
            {"$set": {"s": FLAG, "r": "a"}},
        )

        pairing_doc = await app_state.db.tournament_pairing.find_one({"_id": game.id})
        self.assertEqual(pairing_doc["r"], "d")

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertEqual(len(reloaded_tournament.ongoing_games), 0)
        self.assertEqual(reloaded_tournament.nb_games_finished, 1)

        updated_pairing = await reloaded_tournament.app_state.db.tournament_pairing.find_one(
            {"_id": game.id}
        )
        self.assertEqual(updated_pairing["r"], "a")

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_swiss_bye_persisted_across_restart(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=1, minutes=1)
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(3)
        await self.tournament.clock_task

        player_docs = await app_state.db.tournament_player.find({"tid": tid}).to_list(length=10)
        self.assertTrue(any("-" in doc["p"] for doc in player_docs))

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        bye_players = [
            player_data
            for player_data in reloaded_tournament.players.values()
            if "-" in player_data.points
        ]
        self.assertTrue(bye_players)
        for player_data in bye_players:
            self.assertEqual(len(player_data.games), len(player_data.points))
            self.assertTrue(
                any(isinstance(game, ByeGame) for game in player_data.games),
                "ByeGame missing after reload",
            )

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_finished_tournament_evicted_after_keep_time(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=1, minutes=1)
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(4)
        await self.tournament.clock_task

        pairing = await app_state.db.tournament_pairing.find_one({"tid": tid, "r": {"$ne": "d"}})
        self.assertIsNotNone(pairing)

        del app_state.tournaments[tid]
        app_state.tourneysockets.pop(tid, None)

        loaded = await load_tournament(app_state, tid)
        self.assertIsNotNone(loaded)
        self.assertGreater(loaded.status, T_STARTED)

        player_data = next(iter(loaded.players.values()))
        self.assertIsInstance(player_data, PlayerData)

        game_data = None
        for pdata in loaded.players.values():
            for game in pdata.games:
                if isinstance(game, GameData):
                    game_data = game
                    break
            if game_data is not None:
                break
        self.assertIsNotNone(game_data)

        app_state.schedule_tournament_cache_removal(loaded)

        player_ref = weakref.ref(player_data)
        game_ref = weakref.ref(game_data)

        loaded = None
        player_data = None
        game_data = None

        delay = LOCALHOST_CACHE_KEEP_TIME if URI == LOCALHOST else TOURNAMENT_KEEP_TIME
        await asyncio.sleep(delay + 0.2)
        gc.collect()

        self.assertNotIn(tid, app_state.tournaments)
        self.assertIsNone(player_ref())
        self.assertIsNone(game_ref())
