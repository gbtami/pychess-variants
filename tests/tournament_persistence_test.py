# -*- coding: utf-8 -*-

import asyncio
import gc
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from aiohttp import web
from const import BYEGAME, FLAG, RATED, SHIELD, TEST_PREFIX, T_STARTED
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state import LOCALHOST_CACHE_KEEP_TIME, TOURNAMENT_KEEP_TIME
from pychess_global_app_state_utils import get_app_state
from settings import LOCALHOST, URI
from tournament.arena_new import ArenaTournament
from tournament.auto_play_arena import ArenaTestTournament, SwissTestTournament
from tournament.tournament import ByeGame, GameData, PlayerData, Tournament, upsert_tournament_to_db
from tournament.tournaments import create_or_update_tournament, load_tournament
from tournament_test_base import TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


class TournamentPersistenceTestCase(TournamentTestCase):
    SHORT_SWISS_MINUTES = 0.08

    async def test_arena_entry_conditions_persisted_from_form(self):
        app_state = get_app_state(self.app)
        before_ids = set(app_state.tournaments)
        form = {
            "variant": "chess",
            "rated": "1",
            "position": "",
            "clockTime": "5",
            "clockIncrement": "0",
            "byoyomiPeriod": "0",
            "shield": "",
            "system": str(ArenaTournament.system),
            "rounds": "0",
            "roundInterval": "auto",
            "entryMinRating": "1500",
            "entryMaxRating": "2100",
            "entryMinRatedGames": "30",
            "entryMinAccountAgeDays": "14",
            "entryTitledOnly": "1",
            "forbiddenPairings": "alice bob",
            "manualPairings": "carol dave",
            "startDate": "",
            "name": "Arena Conditions",
            "description": "",
            "password": "",
            "waitMinutes": "5",
            "minutes": "45",
        }

        await create_or_update_tournament(app_state, "tester", form)

        new_ids = set(app_state.tournaments) - before_ids
        self.assertEqual(len(new_ids), 1)
        tournament = app_state.tournaments[new_ids.pop()]
        self.assertEqual(tournament.system, ArenaTournament.system)
        self.assertEqual(tournament.entry_min_rating, 1500)
        self.assertEqual(tournament.entry_max_rating, 2100)
        self.assertEqual(tournament.entry_min_rated_games, 30)
        self.assertEqual(tournament.entry_min_account_age_days, 14)
        self.assertTrue(tournament.entry_titled_only)
        self.assertEqual(tournament.forbidden_pairings, "")
        self.assertEqual(tournament.manual_pairings, "")

        doc = await app_state.db.tournament.find_one({"_id": tournament.id})
        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc.get("entryMinRating"), 1500)
        self.assertEqual(doc.get("entryMaxRating"), 2100)
        self.assertEqual(doc.get("entryMinRatedGames"), 30)
        self.assertEqual(doc.get("entryMinAccountAgeDays"), 14)
        self.assertEqual(doc.get("entryTitledOnly"), True)
        self.assertEqual(doc.get("forbiddenPairings"), "")
        self.assertEqual(doc.get("manualPairings"), "")

    async def test_production_rejects_fixed_round_creation(self):
        app_state = get_app_state(self.app)
        form = {
            "variant": "chess",
            "rated": "1",
            "position": "",
            "clockTime": "5",
            "clockIncrement": "0",
            "byoyomiPeriod": "0",
            "rounds": "5",
            "roundInterval": "auto",
            "entryMinRating": "0",
            "entryMaxRating": "0",
            "entryMinRatedGames": "0",
            "entryMinAccountAgeDays": "0",
            "entryTitledOnly": "",
            "forbiddenPairings": "",
            "manualPairings": "",
            "startDate": "",
            "name": "Fixed Round Disabled",
            "description": "",
            "password": "",
            "waitMinutes": "5",
            "minutes": "45",
        }

        with patch("tournament.tournaments.DEV", False):
            for system in ("1", "2"):
                with self.assertRaises(web.HTTPBadRequest):
                    await create_or_update_tournament(
                        app_state, "tester", {**form, "system": system}
                    )

    async def test_edit_preserves_existing_shield_frequency(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=10, minutes=45, with_clock=False
        )
        self.tournament.frequency = SHIELD
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        form = {
            "variant": "chess",
            "rated": "1",
            "position": "",
            "clockTime": "5",
            "clockIncrement": "0",
            "byoyomiPeriod": "0",
            "system": str(ArenaTournament.system),
            "rounds": "0",
            "roundInterval": "auto",
            "entryMinRating": "0",
            "entryMaxRating": "0",
            "entryMinRatedGames": "0",
            "entryMinAccountAgeDays": "0",
            "entryTitledOnly": "",
            "forbiddenPairings": "",
            "manualPairings": "",
            "startDate": "",
            "name": "Shield Edit",
            "description": "",
            "password": "",
            "waitMinutes": "5",
            "minutes": "45",
        }

        with patch("tournament.tournaments.broadcast_tournament_creation", new=AsyncMock()):
            await create_or_update_tournament(app_state, "tester", form, self.tournament)

        self.assertEqual(self.tournament.frequency, SHIELD)
        doc = await app_state.db.tournament.find_one({"_id": tid})
        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc.get("fr"), SHIELD)

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
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=0, rounds=1, minutes=self.SHORT_SWISS_MINUTES
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(4)
        await self.tournament.clock_task

        doc = await app_state.db.tournament.find_one({"_id": tid})
        self.assertEqual(doc.get("cr"), 1)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertEqual(reloaded_tournament.current_round, 1)

    async def test_swiss_entry_conditions_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=0,
            rounds=5,
            with_clock=False,
            entry_min_rating=1500,
            entry_max_rating=2100,
            entry_min_rated_games=30,
            entry_min_account_age_days=14,
            entry_titled_only=True,
            forbidden_pairings="alice bob",
            manual_pairings="carol dave",
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        doc = await app_state.db.tournament.find_one({"_id": tid})
        self.assertEqual(doc.get("entryMinRating"), 1500)
        self.assertEqual(doc.get("entryMaxRating"), 2100)
        self.assertEqual(doc.get("entryMinRatedGames"), 30)
        self.assertEqual(doc.get("entryMinAccountAgeDays"), 14)
        self.assertEqual(doc.get("entryTitledOnly"), True)
        self.assertEqual(doc.get("forbiddenPairings"), "alice bob")
        self.assertEqual(doc.get("manualPairings"), "carol dave")

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertEqual(reloaded_tournament.entry_min_rating, 1500)
        self.assertEqual(reloaded_tournament.entry_max_rating, 2100)
        self.assertEqual(reloaded_tournament.entry_min_rated_games, 30)
        self.assertEqual(reloaded_tournament.entry_min_account_age_days, 14)
        self.assertTrue(reloaded_tournament.entry_titled_only)
        self.assertEqual(reloaded_tournament.forbidden_pairings, "alice bob")
        self.assertEqual(reloaded_tournament.manual_pairings, "carol dave")

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
        game.board.ply = 20

        await self.tournament.db_update_pairing(game)

        doc = await app_state.db.tournament_pairing.find_one({"_id": game.id})
        self.assertIsNotNone(doc)
        self.assertEqual(doc["r"], "a")
        self.assertTrue(doc["wb"])
        self.assertEqual(doc["p"], 20)
        self.assertEqual(tuple(doc["u"]), (players[0].username, players[1].username))

    async def test_load_tournament_repairs_stale_pairing(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        app_state.tourneysockets[tid] = {}
        await upsert_tournament_to_db(self.tournament, app_state)

        player_a = User(
            app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=make_test_perfs()
        )
        player_b = User(
            app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=make_test_perfs()
        )
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
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=0, rounds=1, minutes=self.SHORT_SWISS_MINUTES
        )
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

    async def test_swiss_bye_pairing_doc_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=10, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1
        await self.tournament.save_current_round()

        waiting_players = list(self.tournament.waiting_players())
        await Tournament.create_new_pairings(self.tournament, waiting_players)

        bye_doc = await app_state.db.tournament_pairing.find_one({"tid": tid, "s": BYEGAME})
        self.assertIsNotNone(bye_doc)
        assert bye_doc is not None
        self.assertEqual(bye_doc["r"], "d")
        self.assertEqual(bye_doc["u"][0], bye_doc["u"][1])

    async def test_load_tournament_repairs_missing_swiss_bye_point_from_pairing_doc(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=10, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1
        await self.tournament.save_current_round()

        waiting_players = list(self.tournament.waiting_players())
        await Tournament.create_new_pairings(self.tournament, waiting_players)

        bye_user = next(
            user.username for user, pdata in self.tournament.players.items() if "-" in pdata.points
        )
        await app_state.db.tournament_player.update_one(
            {"tid": tid, "uid": bye_user},
            {"$set": {"p": [], "s": 0}},
        )

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        repaired_bye_user = reloaded_tournament.get_player_by_name(bye_user)
        self.assertIsNotNone(repaired_bye_user)
        assert repaired_bye_user is not None
        bye_data = reloaded_tournament.players[repaired_bye_user]
        self.assertEqual(bye_data.points, ["-"])
        self.assertEqual(len(bye_data.games), 1)
        self.assertIsInstance(bye_data.games[0], ByeGame)

        repaired_doc = await reloaded_tournament.app_state.db.tournament_player.find_one(
            {"tid": tid, "uid": bye_user}
        )
        self.assertIsNotNone(repaired_doc)
        assert repaired_doc is not None
        self.assertEqual(repaired_doc["p"], ["-"])
        self.assertEqual(repaired_doc["s"], 2)

    async def test_load_tournament_repairs_swiss_points_from_pairings(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=10, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(2)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1
        await self.tournament.save_current_round()

        waiting_players = list(self.tournament.waiting_players())
        _, games = await Tournament.create_new_pairings(self.tournament, waiting_players)
        game = games[0]
        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20
        await self.tournament.game_update(game)

        winner = game.wplayer.username
        await app_state.db.tournament_player.update_one(
            {"tid": tid, "uid": winner},
            {"$set": {"p": [], "s": 0}},
        )

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        repaired_winner = reloaded_tournament.get_player_by_name(winner)
        self.assertIsNotNone(repaired_winner)
        assert repaired_winner is not None
        winner_data = reloaded_tournament.players[repaired_winner]
        self.assertEqual(len(winner_data.games), 1)
        self.assertEqual(winner_data.points[0][0], 2)

        repaired_doc = await reloaded_tournament.app_state.db.tournament_player.find_one(
            {"tid": tid, "uid": winner}
        )
        self.assertIsNotNone(repaired_doc)
        assert repaired_doc is not None
        self.assertEqual(repaired_doc["p"][0][0], 2)
        self.assertEqual(repaired_doc["s"], 2)

    async def test_swiss_unpaired_round_is_persisted_as_zero_point_entry(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=10, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1
        await self.tournament.save_current_round()

        absent = list(self.tournament.players.keys())[0]
        await self.tournament.pause(absent)

        waiting_players = list(self.tournament.waiting_players())
        await self.tournament.create_new_pairings(waiting_players)

        absent_data = self.tournament.players[absent]
        self.assertEqual(absent_data.points[-1], (0, 0))
        self.assertIsInstance(absent_data.games[-1], ByeGame)
        self.assertEqual(getattr(absent_data.games[-1], "token", None), "Z")
        self.assertEqual(getattr(absent_data.games[-1], "round", None), 1)

        zero_doc = await app_state.db.tournament_pairing.find_one(
            {"tid": tid, "u.0": absent.username, "u.1": absent.username, "bt": "Z", "rn": 1}
        )
        self.assertIsNotNone(zero_doc)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        reloaded_absent = reloaded_tournament.get_player_by_name(absent.username)
        self.assertIsNotNone(reloaded_absent)
        assert reloaded_absent is not None
        reloaded_data = reloaded_tournament.players[reloaded_absent]
        self.assertTrue(any(isinstance(game, ByeGame) for game in reloaded_data.games))
        self.assertIn((0, 0), reloaded_data.points)

    async def test_load_tournament_recovers_missing_participant_doc_from_pairings(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        app_state.tourneysockets[tid] = {}
        await upsert_tournament_to_db(self.tournament, app_state)

        winner = User(app_state, username="recover_missing_doc_a", perfs=make_test_perfs())
        missing = User(app_state, username="recover_missing_doc_b", perfs=make_test_perfs())
        app_state.users[winner.username] = winner
        app_state.users[missing.username] = missing
        await app_state.db.user.insert_many(
            [
                {"_id": winner.username, "enabled": True, "security": {}},
                {"_id": missing.username, "enabled": True, "security": {}},
            ]
        )

        await self.tournament.join(winner)
        await self.tournament.join(missing)

        class _DummyWs:
            async def send_json(self, _msg):
                return None

            async def close(self):
                return None

        dummy_ws = _DummyWs()
        winner.tournament_sockets[tid] = set((dummy_ws,))
        missing.tournament_sockets[tid] = set((dummy_ws,))
        app_state.tourneysockets[tid][winner.username] = winner.tournament_sockets[tid]
        app_state.tourneysockets[tid][missing.username] = missing.tournament_sockets[tid]
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]
        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20
        await self.tournament.game_update(game)

        await app_state.db.tournament_player.delete_one({"tid": tid, "uid": missing.username})

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None

        recovered = reloaded_tournament.get_player_by_name(missing.username)
        winner_reloaded = reloaded_tournament.get_player_by_name(winner.username)
        self.assertIsNotNone(recovered)
        self.assertIsNotNone(winner_reloaded)
        assert recovered is not None
        assert winner_reloaded is not None

        self.assertEqual(reloaded_tournament.nb_games_finished, 1)
        self.assertIn(recovered, reloaded_tournament.leaderboard)
        recovered_entries = [
            player
            for player in reloaded_tournament.leaderboard
            if player.username == missing.username
        ]
        self.assertEqual(len(recovered_entries), 1)
        self.assertGreaterEqual(len(reloaded_tournament.players[winner_reloaded].games), 1)
        self.assertGreaterEqual(len(reloaded_tournament.players[recovered].games), 1)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_load_tournament_recovers_deleted_user_from_pairings(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        app_state.tourneysockets[tid] = {}
        await upsert_tournament_to_db(self.tournament, app_state)

        winner = User(app_state, username="recover_deleted_user_a", perfs=make_test_perfs())
        deleted = User(app_state, username="recover_deleted_user_b", perfs=make_test_perfs())
        app_state.users[winner.username] = winner
        app_state.users[deleted.username] = deleted
        await app_state.db.user.insert_many(
            [
                {"_id": winner.username, "enabled": True, "security": {}},
                {"_id": deleted.username, "enabled": True, "security": {}},
            ]
        )

        await self.tournament.join(winner)
        await self.tournament.join(deleted)

        class _DummyWs:
            async def send_json(self, _msg):
                return None

            async def close(self):
                return None

        dummy_ws = _DummyWs()
        winner.tournament_sockets[tid] = set((dummy_ws,))
        deleted.tournament_sockets[tid] = set((dummy_ws,))
        app_state.tourneysockets[tid][winner.username] = winner.tournament_sockets[tid]
        app_state.tourneysockets[tid][deleted.username] = deleted.tournament_sockets[tid]
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]
        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20
        await self.tournament.game_update(game)

        await app_state.db.tournament_player.delete_one({"tid": tid, "uid": deleted.username})
        await app_state.db.user.delete_one({"_id": deleted.username})

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None

        recovered = reloaded_tournament.get_player_by_name(deleted.username)
        winner_reloaded = reloaded_tournament.get_player_by_name(winner.username)
        self.assertIsNotNone(recovered)
        self.assertIsNotNone(winner_reloaded)
        assert recovered is not None
        assert winner_reloaded is not None

        self.assertEqual(recovered.username, deleted.username)
        self.assertEqual(reloaded_tournament.nb_games_finished, 1)
        self.assertIn(recovered, reloaded_tournament.leaderboard)
        recovered_entries = [
            player
            for player in reloaded_tournament.leaderboard
            if player.username == deleted.username
        ]
        self.assertEqual(len(recovered_entries), 1)
        self.assertGreaterEqual(len(reloaded_tournament.players[winner_reloaded].games), 1)
        self.assertGreaterEqual(len(reloaded_tournament.players[recovered].games), 1)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_ongoing_arena_lifecycle_persisted_across_restart(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=10, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(4)
        players = list(self.tournament.players.keys())
        withdrawn_player = players[-1]
        paused_player = players[-2]

        await self.tournament.withdraw(withdrawn_player)
        await self.tournament.start(datetime.now(timezone.utc))
        await self.tournament.pause(paused_player)

        waiting_players = list(self.tournament.waiting_players())
        self.assertEqual(len(waiting_players), 2)

        _, games = await self.tournament.create_new_pairings(waiting_players)
        self.assertEqual(len(games), 1)
        game = games[0]
        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20
        await self.tournament.game_update(game)

        winner_username = game.wplayer.username
        loser_username = game.bplayer.username

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)

        winner = reloaded_tournament.get_player_by_name(winner_username)
        loser = reloaded_tournament.get_player_by_name(loser_username)
        paused = reloaded_tournament.get_player_by_name(paused_player.username)
        withdrawn = reloaded_tournament.get_player_by_name(withdrawn_player.username)
        self.assertIsNotNone(winner)
        self.assertIsNotNone(loser)
        self.assertIsNotNone(paused)
        self.assertIsNotNone(withdrawn)
        assert winner is not None
        assert loser is not None
        assert paused is not None
        assert withdrawn is not None

        self.assertEqual(reloaded_tournament.nb_games_finished, 1)
        self.assertEqual(reloaded_tournament.players[winner].points[0][0], 2)
        self.assertEqual(reloaded_tournament.players[loser].points[0][0], 0)
        self.assertEqual(reloaded_tournament.get_rank_by_username(winner.username), 1)

        self.assertTrue(reloaded_tournament.players[paused].paused)
        self.assertFalse(reloaded_tournament.players[paused].withdrawn)
        self.assertIn(paused, reloaded_tournament.leaderboard)

        self.assertTrue(reloaded_tournament.players[withdrawn].withdrawn)
        self.assertNotIn(withdrawn, reloaded_tournament.leaderboard)
        self.assertIsNone(reloaded_tournament.get_rank_by_username(withdrawn.username))

        class _DummyWs:
            async def close(self):
                return None

        dummy_ws = _DummyWs()
        for player in reloaded_tournament.players:
            player.tournament_sockets[tid] = set((dummy_ws,))
            reloaded_tournament.app_state.tourneysockets[tid][player.username] = (
                player.tournament_sockets[tid]
            )

        reloaded_waiting = reloaded_tournament.waiting_players()
        self.assertIn(winner, reloaded_waiting)
        self.assertIn(loser, reloaded_waiting)
        self.assertNotIn(paused, reloaded_waiting)
        self.assertNotIn(withdrawn, reloaded_waiting)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_finished_tournament_evicted_after_keep_time(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=0, rounds=1, minutes=self.SHORT_SWISS_MINUTES
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

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

        loaded = None
        player_data = None
        game_data = None

        delay = LOCALHOST_CACHE_KEEP_TIME if URI == LOCALHOST else TOURNAMENT_KEEP_TIME
        await asyncio.sleep(delay + 0.2)
        gc.collect()

        self.assertNotIn(tid, app_state.tournaments)
