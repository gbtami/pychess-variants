# -*- coding: utf-8 -*-

import unittest
from itertools import product

from mongomock_motor import AsyncMongoMockClient
from aiohttp.test_utils import AioHTTPTestCase

from server import make_app
from seek import Seek
from user import User
from pychess_global_app_state_utils import get_app_state
from const import VARIANTS
from glicko2.glicko2 import DEFAULT_PERF
from auto_pair import add_to_auto_pairings


PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}
HIGH_PERFS = {variant: {"gl": {"r": 2300}} for variant in VARIANTS}
LOW_PERFS = {variant: {"gl": {"r": 700}} for variant in VARIANTS}

ALL_TC = [
    (1, 0, 0),
    (3, 0, 0),
    (3, 2, 0),
    (5, 3, 0),
    (2, 15, 1),
    (5, 15, 1),
]

ALL_VARIANT = product(map(lambda x: x.removesuffix("960"), VARIANTS), (True, False))

DATA = {
    "all": {"variants": ALL_VARIANT, "tcs": ALL_TC, "rrmin": -1000, "rrmax": 1000},
    "chess": {"variants": [("chess", False)], "tcs": ALL_TC, "rrmin": -1000, "rrmax": 1000},
    "chess960": {"variants": [("chess", True)], "tcs": ALL_TC, "rrmin": -1000, "rrmax": 1000},
    "chess-500+500": {"variants": [("chess", False)], "tcs": ALL_TC, "rrmin": -500, "rrmax": 500},
    "chess-800+800": {"variants": [("chess", False)], "tcs": ALL_TC, "rrmin": -800, "rrmax": 800},
}


class AutoPairingTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        # players with default ratings
        self.aplayer = User(app_state, username="aplayer", perfs=PERFS)
        self.bplayer = User(app_state, username="bplayer", perfs=PERFS)
        self.cplayer = User(app_state, username="cplayer", perfs=PERFS)
        self.dplayer = User(app_state, username="dplayer", perfs=PERFS)
        self.eplayer = User(app_state, username="eplayer", perfs=PERFS)

        # low rated player
        self.lplayer = User(get_app_state(self.app), username="lplayer", perfs=LOW_PERFS)

        # high rated player
        self.hplayer = User(get_app_state(self.app), username="hplayer", perfs=HIGH_PERFS)

        app_state.users["aplayer"] = self.aplayer
        app_state.users["bplayer"] = self.bplayer
        app_state.users["cplayer"] = self.cplayer
        app_state.users["dplayer"] = self.dplayer
        app_state.users["eplayer"] = self.eplayer
        app_state.users["lplayer"] = self.lplayer
        app_state.users["hplayer"] = self.hplayer

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    def test_add_to_auto_pairings(self):
        app_state = get_app_state(self.app)

        variant_tc = ("chess", False, 5, 3, 0)
        auto_variant_tc, matching_user, matching_seek = add_to_auto_pairings(
            app_state, self.bplayer, DATA["chess"]
        )

        self.assertEqual(auto_variant_tc, variant_tc)
        self.assertEqual(app_state.auto_pairing_users[self.bplayer], (-10000, 10000))
        self.assertIn(self.bplayer, app_state.auto_pairings[variant_tc])
        self.assertTrue(self.bplayer.ready_for_auto_pairing)

        variant_tc = ("chess", True, 5, 3, 0)
        auto_variant_tc, matching_user, matching_seek = add_to_auto_pairings(
            app_state, self.aplayer, DATA["chess960"]
        )

        self.assertEqual(auto_variant_tc, variant_tc)
        self.assertIsNone(matching_user)
        self.assertIsNone(matching_seek)
        self.assertTrue(self.aplayer.ready_for_auto_pairing)

    def remove_from_auto_pairings(self):
        app_state = get_app_state(self.app)

        variant_tc = ("chess", False, 5, 3, 0)
        add_to_auto_pairings(app_state, self.bplayer, DATA["chess"])
        self.bplayer.remove_from_auto_pairings()

        self.assertNotIn(self.bplayer, app_state.auto_pairing_users)
        self.assertNotIn(self.bplayer, app_state.auto_pairings[variant_tc])
        self.assretFalse(self.bplayer.ready_for_auto_pairing)

    def test_auto_compatible_with_seek0(self):
        seek = Seek("id", self.aplayer, "chess")  # accepts any ratings

        # auto_compatible_with_seek() checks rating ranges and blocked users only!
        add_to_auto_pairings(get_app_state(self.app), self.bplayer, DATA["chess960"])
        result = self.bplayer.auto_compatible_with_seek(seek)
        self.assertTrue(result)

        # auto_compatible_with_seek() checks rating ranges and blocked users only!
        add_to_auto_pairings(get_app_state(self.app), self.cplayer, DATA["chess"])
        result = self.cplayer.auto_compatible_with_seek(seek)
        self.assertTrue(result)

        # now auto pairing creator blocks the seek creator
        self.dplayer.blocked.add("aplayer")
        add_to_auto_pairings(get_app_state(self.app), self.dplayer, DATA["chess960"])
        result = self.dplayer.auto_compatible_with_seek(seek)
        self.assertFalse(result)

        # now seek creator blocks auto pairing creator
        self.aplayer.blocked.add("eplayer")
        add_to_auto_pairings(get_app_state(self.app), self.eplayer, DATA["chess960"])
        result = self.eplayer.auto_compatible_with_seek(seek)
        self.assertFalse(result)

    def test_auto_compatible_with_seek1(self):
        # low rating player and auto pairing range is not OK
        seek = Seek(
            "id", self.lplayer, "chess", rrmin=-200, rrmax=0
        )  # low rated player, accepts 500-700
        add_to_auto_pairings(
            get_app_state(self.app), self.aplayer, DATA["chess-500+500"]
        )  # accepts 1000-2000
        result = self.aplayer.auto_compatible_with_seek(seek)
        self.assertFalse(result)

        # low rating player and auto pairing range is OK
        seek = Seek(
            "id", self.lplayer, "chess", rrmin=-200, rrmax=900
        )  # low rated player, accepts 500-1500
        add_to_auto_pairings(
            get_app_state(self.app), self.bplayer, DATA["chess-800+800"]
        )  # accepts 700-2300
        result = self.bplayer.auto_compatible_with_seek(seek)
        self.assertTrue(result)

    def test_auto_compatible_with_seek2(self):
        # high rating player and auto pairing ranges don't overlap
        seek = Seek(
            "id", self.hplayer, "chess", rrmin=-200, rrmax=200
        )  # high rated player, accepts 2100-2500
        add_to_auto_pairings(
            get_app_state(self.app), self.aplayer, DATA["chess-500+500"]
        )  # accepts 1000-2000
        result = self.aplayer.auto_compatible_with_seek(seek)
        self.assertFalse(result)

        # high rating player and auto pairing ranges are overlapping
        seek = Seek(
            "id", self.hplayer, "chess", rrmin=-900, rrmax=200
        )  # high rated player, accepts 1400-2500
        add_to_auto_pairings(
            get_app_state(self.app), self.bplayer, DATA["chess-800+800"]
        )  # accepts 700-2300
        result = self.bplayer.auto_compatible_with_seek(seek)
        self.assertTrue(result)

    def test_auto_compatible_with_other_user0(self):
        add_to_auto_pairings(get_app_state(self.app), self.aplayer, DATA["chess"])
        add_to_auto_pairings(get_app_state(self.app), self.bplayer, DATA["chess960"])

        # auto_compatible_with_other_user() checks rating ranges and blocked users only!
        result = self.aplayer.auto_compatible_with_other_user(self.bplayer, "chess", False)
        self.assertTrue(result)

        # auto_compatible_with_other_user() checks rating ranges and blocked users only!
        result = self.aplayer.auto_compatible_with_other_user(self.bplayer, "chess", True)
        self.assertTrue(result)

    def test_auto_compatible_with_other_user1(self):
        add_to_auto_pairings(
            get_app_state(self.app), self.lplayer, DATA["chess"]
        )  # accepts any range
        add_to_auto_pairings(
            get_app_state(self.app), self.aplayer, DATA["chess-500+500"]
        )  # accepts 1000-2000
        add_to_auto_pairings(
            get_app_state(self.app), self.bplayer, DATA["chess-800+800"]
        )  # accepts 700-2300

        # low rating player and default player
        result = self.lplayer.auto_compatible_with_other_user(self.aplayer, "chess", False)
        self.assertFalse(result)

        # low rating player and default player
        result = self.lplayer.auto_compatible_with_other_user(self.bplayer, "chess", False)
        self.assertTrue(result)

    def test_auto_compatible_with_other_user2(self):
        add_to_auto_pairings(
            get_app_state(self.app), self.hplayer, DATA["chess"]
        )  # accepts any range
        add_to_auto_pairings(
            get_app_state(self.app), self.aplayer, DATA["chess-500+500"]
        )  # accepts 1000-2000
        add_to_auto_pairings(
            get_app_state(self.app), self.bplayer, DATA["chess-800+800"]
        )  # accepts 700-2300

        # high rating player and default player
        result = self.hplayer.auto_compatible_with_other_user(self.aplayer, "chess", False)
        self.assertFalse(result)

        # high rating player and default player
        result = self.hplayer.auto_compatible_with_other_user(self.bplayer, "chess", False)
        self.assertTrue(result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
