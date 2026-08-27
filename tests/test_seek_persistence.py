import asyncio
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import patch

import test_logger
from glicko2.glicko2 import new_default_perf_map
from header_challenges import set_direct_challenge_status
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state import PychessGlobalAppState
from pychess_global_app_state_utils import get_app_state
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from seek import DIRECT_CHALLENGE_ACCEPTED, DIRECT_CHALLENGE_CREATED, Seek
from settings import MONGO_DB_NAME
from tournament.auto_play_tournament import RRTestTournament
from tournament.rr import ARR_STATUS_CHALLENGED, RRTournament
from tournament.tournament import upsert_tournament_to_db
from typedefs import pychess_global_app_state_key
from user import User
from utils import join_seek
from variants import VARIANTS

from server import init_state, make_app

test_logger.init_test_logger()

PERFS = new_default_perf_map(VARIANTS)


class SeekPersistenceTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db_client = cast(AsyncMongoClient, AsyncMongoMockClient(tz_aware=True))
        self.db = self.db_client[MONGO_DB_NAME]
        self.app = make_app(db_client=self.db_client)

    async def asyncTearDown(self):
        try:
            await get_app_state(self.app).server_shutdown()
        except KeyError:
            pass

    def make_user(self, username: str) -> User:
        return User(SimpleNamespace(anon_as_test_users=False), username=username, perfs=PERFS)

    async def test_corr_direct_challenge_restores_target_after_restart(self):
        await self.db.user.insert_many([{"_id": "alice"}, {"_id": "bob"}])

        challenger = self.make_user("alice")

        seek = Seek(
            "seek-corr-direct",
            challenger,
            "chess",
            day=2,
            target="bob",
            player1=challenger,
        )
        await self.db.seek.insert_one(seek.seek_db_json)

        await init_state(self.app)
        app_state = get_app_state(self.app)
        reloaded_seek = app_state.seeks["seek-corr-direct"]

        self.assertEqual("bob", reloaded_seek.target)
        self.assertTrue(reloaded_seek.is_direct_challenge)
        self.assertEqual(DIRECT_CHALLENGE_CREATED, reloaded_seek.challenge_status)
        self.assertIn(reloaded_seek.id, app_state.users["alice"].seeks)

    async def test_corr_invite_restores_game_id_and_invite_mapping_after_restart(self):
        await self.db.user.insert_many([{"_id": "alice"}])

        challenger = self.make_user("alice")

        seek = Seek(
            "seek-corr-invite",
            challenger,
            "chess",
            day=3,
            target="Invite-friend",
            game_id="AbCd1234",
            player1=challenger,
        )
        await self.db.seek.insert_one(seek.seek_db_json)

        await init_state(self.app)
        app_state = get_app_state(self.app)
        reloaded_seek = app_state.seeks["seek-corr-invite"]

        self.assertEqual("Invite-friend", reloaded_seek.target)
        self.assertEqual("AbCd1234", reloaded_seek.game_id)
        self.assertIs(app_state.invites["AbCd1234"], reloaded_seek)

    async def test_rr_challenge_restores_tournament_linkage_after_restart(self):
        await self.db.user.insert_many([{"_id": "alice"}, {"_id": "bob"}])

        challenger = self.make_user("alice")
        tournament_id = "Tour1234"
        arrangement_id = "rr-arrangement-1"
        game_id = "AbCd1234"
        seek = Seek(
            "seek-rr-challenge",
            challenger,
            "chess",
            target="bob",
            game_id=game_id,
            player1=challenger,
            tournament_id=tournament_id,
            rr_arrangement_id=arrangement_id,
        )
        await self.db.seek.insert_one(seek.seek_db_json)

        await init_state(self.app)
        app_state = get_app_state(self.app)
        reloaded_seek = app_state.seeks[seek.id]

        self.assertEqual(tournament_id, reloaded_seek.tournament_id)
        self.assertEqual(arrangement_id, reloaded_seek.rr_arrangement_id)
        self.assertIs(app_state.invites[game_id], reloaded_seek)

        result = await join_seek(app_state, app_state.users["bob"], reloaded_seek, game_id)
        self.assertEqual("new_game", result["type"])
        game = app_state.games[game_id]
        self.assertEqual(tournament_id, game.tournamentId)
        self.assertEqual(arrangement_id, game.tournamentArrangementId)

        game_doc = await self.db.game.find_one({"_id": game_id})
        self.assertIsNotNone(game_doc)
        self.assertEqual(tournament_id, game_doc["tid"])
        self.assertEqual(arrangement_id, game_doc["aid"])

    async def test_rr_challenge_is_restored_before_arrangement_reconciliation(self):
        producer_app = make_app(db_client=self.db_client)
        producer_app[pychess_global_app_state_key] = PychessGlobalAppState(producer_app)
        producer_state = get_app_state(producer_app)

        await self.db.user.insert_many([{"_id": "alice"}, {"_id": "bob"}])
        alice = User(producer_state, username="alice", perfs=PERFS)
        bob = User(producer_state, username="bob", perfs=PERFS)
        producer_state.users.update({alice.username: alice, bob.username: bob})

        tournament = RRTestTournament(
            producer_state,
            "Tour1234",
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=2,
            with_clock=False,
        )
        producer_state.tournaments[tournament.id] = tournament
        await upsert_tournament_to_db(tournament, producer_state)
        await tournament.join(alice)
        await tournament.join(bob)
        await tournament.start(datetime.now(UTC))

        arrangement = tournament.arrangement_list()[0]
        challenger = alice if arrangement.white == alice.username else bob
        self.assertIsNone(await tournament.create_arrangement_challenge(challenger, arrangement.id))
        self.assertEqual(ARR_STATUS_CHALLENGED, arrangement.status)
        invite_id = arrangement.invite_id
        assert invite_id is not None
        persisted_seek = producer_state.invites[invite_id]
        await self.db.seek.insert_one(persisted_seek.seek_db_json)

        restarted_app = make_app(db_client=self.db_client)
        self.app = restarted_app
        await init_state(restarted_app)
        restarted_state = get_app_state(restarted_app)
        restarted_tournament = restarted_state.tournaments[tournament.id]
        self.assertIsInstance(restarted_tournament, RRTournament)
        assert isinstance(restarted_tournament, RRTournament)
        restarted_arrangement = restarted_tournament.arrangement_by_id(arrangement.id)

        self.assertIsNotNone(restarted_arrangement)
        assert restarted_arrangement is not None
        self.assertEqual(ARR_STATUS_CHALLENGED, restarted_arrangement.status)
        self.assertEqual(invite_id, restarted_arrangement.invite_id)
        restarted_seek = restarted_state.invites[invite_id]
        self.assertIs(restarted_seek, restarted_state.seeks[persisted_seek.id])
        self.assertEqual(tournament.id, restarted_seek.tournament_id)
        self.assertEqual(arrangement.id, restarted_seek.rr_arrangement_id)

        if restarted_tournament.clock_task is not None:
            restarted_tournament.clock_task.cancel()
            try:
                await restarted_tournament.clock_task
            except asyncio.CancelledError:
                pass

    def test_catalogued_rr_seek_preserves_tournament_linkage(self):
        challenger = self.make_user("alice")
        with patch("seek.is_catalogued_variant", return_value=True):
            rr_seek = Seek(
                "seek-catalogued-rr",
                challenger,
                "chess",
                target="bob",
                tournament_id="Tour1234",
                rr_arrangement_id="rr-arrangement-1",
                rated=True,
                chess960=True,
            )

        self.assertFalse(rr_seek.rated)
        self.assertFalse(rr_seek.chess960)
        self.assertEqual("Tour1234", rr_seek.tournament_id)
        self.assertEqual("rr-arrangement-1", rr_seek.rr_arrangement_id)

    async def test_terminal_corr_direct_challenge_is_not_restored_after_restart(self):
        await self.db.user.insert_many([{"_id": "alice"}, {"_id": "bob"}])

        challenger = self.make_user("alice")
        seek = Seek(
            "seek-corr-accepted",
            challenger,
            "chess",
            day=2,
            target="bob",
            player1=challenger,
        )
        set_direct_challenge_status(seek, DIRECT_CHALLENGE_ACCEPTED)
        await self.db.seek.insert_one(seek.seek_db_json)

        await init_state(self.app)
        app_state = get_app_state(self.app)

        self.assertNotIn(seek.id, app_state.seeks)
        self.assertNotIn(seek.id, app_state.users["alice"].seeks)

    async def test_persisted_seek_for_deleted_variant_is_dropped(self):
        await self.db.user.insert_one({"_id": "alice"})

        challenger = self.make_user("alice")
        seek = Seek("seek-deleted-variant", challenger, "chess", day=2, player1=challenger)
        doc = seek.seek_db_json
        doc["variant"] = "deleted_catalogued_variant"
        await self.db.seek.insert_one(doc)

        await init_state(self.app)
        app_state = get_app_state(self.app)

        self.assertNotIn(seek.id, app_state.seeks)
        self.assertIsNone(await self.db.seek.find_one({"_id": seek.id}))

    async def test_server_shutdown_does_not_persist_terminal_corr_direct_challenge(self):
        await init_state(self.app)
        app_state = get_app_state(self.app)
        alice = self.make_user("alice")
        bob = self.make_user("bob")
        app_state.users.update({alice.username: alice, bob.username: bob})

        accepted = Seek(
            "seek-corr-accepted",
            alice,
            "chess",
            day=2,
            target=bob.username,
            player1=alice,
        )
        set_direct_challenge_status(accepted, DIRECT_CHALLENGE_ACCEPTED)
        active = Seek(
            "seek-corr-active",
            alice,
            "chess",
            day=2,
            target=bob.username,
            player1=alice,
        )
        corr_seek = Seek("seek-corr-open", alice, "chess", day=2, player1=alice)
        app_state.seeks.update({accepted.id: accepted, active.id: active, corr_seek.id: corr_seek})
        alice.seeks.update({accepted.id: accepted, active.id: active, corr_seek.id: corr_seek})

        await app_state.server_shutdown()

        persisted = {doc["_id"] async for doc in app_state.db.seek.find({}, {"_id": 1})}
        self.assertEqual({"seek-corr-active", "seek-corr-open"}, persisted)
