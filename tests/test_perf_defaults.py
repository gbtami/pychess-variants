from datetime import datetime, timezone
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from glicko2.glicko2 import new_default_perf, new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
from variants import RATED_VARIANTS


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
        shared_timestamp = datetime.now(timezone.utc)
        shared_perf = {
            "gl": {"r": 1500.0, "d": 350.0, "v": 0.06},
            "la": shared_timestamp,
            "nb": 0,
        }
        source_perfs = {variant: shared_perf for variant in RATED_VARIANTS}

        user = User(app_state, username="perf-test", perfs=source_perfs)

        variants = list(RATED_VARIANTS)
        self.assertIsNot(user.perfs[variants[0]], user.perfs[variants[1]])
        self.assertIsNot(user.perfs[variants[0]]["gl"], user.perfs[variants[1]]["gl"])

        user.perfs[variants[0]]["gl"]["r"] = 1600.0
        self.assertEqual(user.perfs[variants[1]]["gl"]["r"], 1500.0)
        self.assertEqual(source_perfs[variants[0]]["gl"]["r"], 1500.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
