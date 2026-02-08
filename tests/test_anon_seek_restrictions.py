import unittest
from typing import cast
from mongomock_motor import AsyncMongoMockClient
from pymongo.asynchronous.mongo_client import AsyncMongoClient

from pychess_global_app_state_utils import get_app_state
from seek import ANON_RESTRICTED_SEEK_MESSAGE, Seek, create_seek
from server import init_state, make_app
from user import User
from utils import join_seek

class AnonSeekRestrictionsTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        db_client = cast(AsyncMongoClient, AsyncMongoMockClient())
        self.app = make_app(db_client=db_client)
        await init_state(self.app)

    async def asyncTearDown(self):
        try:
            await get_app_state(self.app).server_shutdown()
        except KeyError:
            pass

    def add_user(self, username: str, anon: bool = False) -> User:
        app_state = get_app_state(self.app)
        user = User(app_state, username=username, anon=anon)
        app_state.users[username] = user
        return user

    async def test_create_seek_rejects_anon_corr(self):
        app_state = get_app_state(self.app)
        anon = self.add_user("Anon-corr", anon=True)

        seek = await create_seek(
            app_state.db,
            app_state.invites,
            app_state.seeks,
            anon,
            {
                "variant": "chess",
                "fen": "",
                "color": "r",
                "minutes": 3,
                "increment": 2,
                "byoyomiPeriod": 0,
                "day": 1,
                "rated": False,
                "chess960": False,
            },
        )

        self.assertIsNone(seek)
        self.assertEqual(0, len(app_state.seeks))
        self.assertEqual(0, len(app_state.invites))

    async def test_create_seek_rejects_anon_bughouse(self):
        app_state = get_app_state(self.app)
        anon = self.add_user("Anon-bug", anon=True)

        seek = await create_seek(
            app_state.db,
            app_state.invites,
            app_state.seeks,
            anon,
            {
                "variant": "bughouse",
                "fen": "",
                "color": "r",
                "minutes": 3,
                "increment": 2,
                "byoyomiPeriod": 0,
                "day": 0,
                "rated": False,
                "chess960": False,
            },
        )

        self.assertIsNone(seek)
        self.assertEqual(0, len(app_state.seeks))
        self.assertEqual(0, len(app_state.invites))

    async def test_join_seek_rejects_anon_corr(self):
        app_state = get_app_state(self.app)
        creator = self.add_user("creator")
        anon = self.add_user("Anon-join-corr", anon=True)

        seek = Seek("seek-corr", creator, "chess", day=2, player1=creator)
        app_state.seeks[seek.id] = seek

        response = await join_seek(app_state, anon, seek)

        self.assertEqual("error", response["type"])
        self.assertEqual(ANON_RESTRICTED_SEEK_MESSAGE, response["message"])
        self.assertIsNone(seek.player2)
        self.assertEqual(0, len(app_state.games))

    async def test_join_seek_rejects_anon_bughouse(self):
        app_state = get_app_state(self.app)
        creator = self.add_user("creator-bug")
        anon = self.add_user("Anon-join-bug", anon=True)

        seek = Seek("seek-bug", creator, "bughouse", day=0, player1=creator)
        app_state.seeks[seek.id] = seek

        response = await join_seek(app_state, anon, seek)

        self.assertEqual("error", response["type"])
        self.assertEqual(ANON_RESTRICTED_SEEK_MESSAGE, response["message"])
        self.assertIsNone(seek.player2)
        self.assertEqual(0, len(app_state.games))

    async def test_join_seek_allows_registered_corr(self):
        app_state = get_app_state(self.app)
        creator = self.add_user("creator-ok")
        joiner = self.add_user("joiner-ok")

        seek = Seek("seek-corr-ok", creator, "chess", day=1, player1=creator)
        app_state.seeks[seek.id] = seek

        response = await join_seek(app_state, joiner, seek)

        self.assertEqual("new_game", response["type"])
        game = app_state.games[response["gameId"]]
        self.assertTrue(game.corr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
