import unittest
from types import SimpleNamespace
from typing import cast

import test_logger
from mongomock_motor import AsyncMongoMockClient
from pymongo.asynchronous.mongo_client import AsyncMongoClient

from glicko2.glicko2 import new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from header_challenges import set_direct_challenge_status
from seek import DIRECT_CHALLENGE_ACCEPTED, DIRECT_CHALLENGE_CREATED, Seek
from server import init_state, make_app
from settings import MONGO_DB_NAME
from user import User
from variants import VARIANTS

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
