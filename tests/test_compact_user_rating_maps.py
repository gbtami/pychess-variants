from __future__ import annotations

import unittest
from contextlib import redirect_stderr
from datetime import UTC, datetime
from io import StringIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

from mongomock_motor import AsyncMongoMockClient
from typing_defs import PerfEntry

from scripts.compact_user_rating_maps import (
    apply_compaction_batch,
    build_compaction_plan,
    is_exact_default_perf,
    parse_args,
)


def default_perf() -> PerfEntry:
    return {
        "gl": {"r": 1500.0, "d": 350.0, "v": 0.06},
        "la": datetime.now(UTC),
        "nb": 0,
    }


class CompactUserRatingMapsTestCase(unittest.IsolatedAsyncioTestCase):
    def test_exact_default_perf_is_removable(self) -> None:
        self.assertTrue(is_exact_default_perf(default_perf()))

    def test_meaningful_or_malformed_entries_are_preserved(self) -> None:
        cases = []

        played = default_perf()
        played["nb"] = 1
        cases.append(played)

        rated = default_perf()
        rated["gl"]["r"] = 1501.0
        cases.append(rated)

        extra = default_perf()
        extra["source"] = "manual"
        cases.append(extra)

        missing_timestamp = default_perf()
        del missing_timestamp["la"]
        cases.append(missing_timestamp)

        boolean_count = default_perf()
        boolean_count["nb"] = False
        cases.append(boolean_count)

        for entry in cases:
            with self.subTest(entry=entry):
                self.assertFalse(is_exact_default_perf(entry))

    def test_plan_targets_defaults_and_preserves_other_entries(self) -> None:
        perfs_default = default_perf()
        pperfs_default = default_perf()
        played = default_perf()
        played["nb"] = 2

        plan = build_compaction_plan(
            {
                "_id": "player",
                "perfs": {
                    "chess": perfs_default,
                    "shogi": played,
                    "unsafe.variant": default_perf(),
                },
                "pperfs": {"antichess": pperfs_default},
            }
        )

        self.assertEqual(2, plan.entry_count)
        self.assertEqual(1, plan.perfs_entries)
        self.assertEqual(1, plan.pperfs_entries)
        self.assertEqual(1, plan.unsafe_entries)
        self.assertEqual(
            {
                "_id": "player",
                "perfs.chess": perfs_default,
                "pperfs.antichess": pperfs_default,
            },
            plan.query,
        )
        self.assertEqual(
            {
                "perfs.chess": "",
                "pperfs.antichess": "",
            },
            plan.unset_fields,
        )

    async def test_batch_reports_only_users_still_matching_the_read_entries(self) -> None:
        collection = SimpleNamespace(
            bulk_write=AsyncMock(
                return_value=SimpleNamespace(
                    matched_count=1,
                    modified_count=1,
                )
            )
        )
        plans = [
            build_compaction_plan({"_id": "one", "perfs": {"chess": default_perf()}}),
            build_compaction_plan({"_id": "two", "pperfs": {"shogi": default_perf()}}),
        ]

        matched, modified = await apply_compaction_batch(collection, plans)

        self.assertEqual(1, matched)
        self.assertEqual(1, modified)
        collection.bulk_write.assert_awaited_once()
        _, kwargs = collection.bulk_write.await_args
        self.assertFalse(kwargs["ordered"])

    async def test_optimistic_query_does_not_remove_a_rating_changed_after_read(self) -> None:
        client = AsyncMongoMockClient(tz_aware=True)
        collection = client.test.user
        await collection.insert_one({"_id": "player", "perfs": {"chess": default_perf()}})
        doc = await collection.find_one({"_id": "player"})
        plan = build_compaction_plan(doc)

        await collection.update_one({"_id": "player"}, {"$set": {"perfs.chess.gl.r": 1600.0}})
        result = await collection.update_one(plan.query, {"$unset": plan.unset_fields})

        self.assertEqual(0, result.matched_count)
        updated = await collection.find_one({"_id": "player"})
        self.assertEqual(1600.0, updated["perfs"]["chess"]["gl"]["r"])
        client.close()

    def test_argument_validation_rejects_unsafe_load_settings(self) -> None:
        with redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit):
                parse_args(["--batch-size", "0"])
            with self.assertRaises(SystemExit):
                parse_args(["--pause-seconds", "-1"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
