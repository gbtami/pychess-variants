import unittest
from datetime import UTC, datetime

from aiohttp.test_utils import AioHTTPTestCase
from glicko2.glicko2 import gl2, new_default_perf, new_default_perf_map, sparse_perf_map
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from user import User
from variants import RATED_VARIANTS

from server import make_app


class PerfDefaultsTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_new_default_perf_creates_fresh_nested_dicts(self):
        perf1 = new_default_perf()
        perf2 = new_default_perf()

        self.assertIsNot(perf1, perf2)
        self.assertIsNot(perf1["gl"], perf2["gl"])
        self.assertEqual(perf1["gl"]["r"], perf2["gl"]["r"])

    async def test_new_default_perf_map_creates_distinct_variant_entries(self):
        perfs = new_default_perf_map(RATED_VARIANTS)
        variants = list(RATED_VARIANTS)

        self.assertIsNot(perfs[variants[0]], perfs[variants[1]])
        self.assertIsNot(perfs[variants[0]]["gl"], perfs[variants[1]]["gl"])

    async def test_user_normalizes_shared_source_map_into_fresh_entries(self):
        app_state = get_app_state(self.app)
        shared_timestamp = datetime.now(UTC)
        shared_perf = {
            "gl": {"r": 1500.0, "d": 350.0, "v": 0.06},
            "la": shared_timestamp,
            "nb": 1,
        }
        source_perfs = {variant: shared_perf for variant in RATED_VARIANTS}

        user = User(app_state, username="perf-test", perfs=source_perfs)

        variants = list(RATED_VARIANTS)
        self.assertIsNot(user.perfs[variants[0]], user.perfs[variants[1]])
        self.assertIsNot(user.perfs[variants[0]]["gl"], user.perfs[variants[1]]["gl"])

        user.perfs[variants[0]]["gl"]["r"] = 1600.0
        self.assertEqual(user.perfs[variants[1]]["gl"]["r"], 1500.0)
        self.assertEqual(source_perfs[variants[0]]["gl"]["r"], 1500.0)

    async def test_sparse_perf_map_discards_defaults_and_unknown_variants(self):
        default_perf = new_default_perf()
        non_default_perf = new_default_perf()
        non_default_perf["gl"]["r"] = 1600.0

        perfs = sparse_perf_map(
            RATED_VARIANTS,
            {
                RATED_VARIANTS[0]: default_perf,
                RATED_VARIANTS[1]: non_default_perf,
                "not-a-variant": non_default_perf,
            },
        )

        self.assertEqual([RATED_VARIANTS[1]], list(perfs))
        self.assertEqual(1600.0, perfs[RATED_VARIANTS[1]]["gl"]["r"])

    async def test_missing_rating_lookups_do_not_create_perf_entries(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="sparse-ratings")

        rating = user.get_rating("chess", False)
        puzzle_rating = user.get_puzzle_rating("chess", False)

        self.assertEqual(rating.mu, 1500.0)
        self.assertEqual(puzzle_rating.mu, 1500.0)
        self.assertEqual(1500, user.get_rating_value("chess", False))
        self.assertEqual({}, user.perfs)
        self.assertEqual({}, user.pperfs)

    async def test_rating_updates_create_and_persist_only_the_changed_variant(self):
        app_state = get_app_state(self.app)
        username = "rating-write"
        await app_state.db.user.insert_one({"_id": username, "perfs": {}, "pperfs": {}})
        user = User(app_state, username=username)

        await user.set_rating("chess", False, gl2.create_rating(1600.0, 200.0, 0.06))
        await user.set_puzzle_rating("shogi", False, gl2.create_rating(1700.0, 180.0, 0.06))

        self.assertEqual(["chess"], list(user.perfs))
        self.assertEqual(["shogi"], list(user.pperfs))
        self.assertEqual(1, user.perfs["chess"]["nb"])
        self.assertEqual(1, user.pperfs["shogi"]["nb"])

        doc = await app_state.db.user.find_one({"_id": username})
        self.assertEqual(["chess"], list(doc["perfs"]))
        self.assertEqual(["shogi"], list(doc["pperfs"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
