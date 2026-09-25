from __future__ import annotations

import unittest
from types import SimpleNamespace
from typing import Any, cast

from database.schema import COLLECTIONS_BY_NAME, INDEXES_BY_COLLECTION
from mongomock_motor import AsyncMongoMockClient
from practice_progress import (
    load_practice_progress,
    practice_progress_key,
    record_practice_completion,
    reset_practice_chapters,
)


class PracticeProgressTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = cast(Any, SimpleNamespace(db=self.db))

    def test_practice_collection_uses_only_the_builtin_id_index(self) -> None:
        self.assertIn("practice", COLLECTIONS_BY_NAME)
        self.assertEqual(INDEXES_BY_COLLECTION["practice"], ())

    async def test_completion_round_trip_and_resume(self) -> None:
        empty = await load_practice_progress(self.app_state, "learner")
        self.assertEqual(empty.for_study("study001", ("chap0001", "chap0002")).done, 0)
        self.assertEqual(empty.first_unfinished("study001", ("chap0001", "chap0002")), "chap0001")

        await record_practice_completion(self.app_state, "learner", "study001", "chap0001")
        progress = await load_practice_progress(self.app_state, "learner")
        summary = progress.for_study("study001", ("chap0001", "chap0002"))

        self.assertEqual(summary.completed_chapter_ids, ("chap0001",))
        self.assertEqual((summary.done, summary.total, summary.state), (1, 2, "ongoing"))
        self.assertEqual(
            progress.first_unfinished("study001", ("chap0001", "chap0002")), "chap0002"
        )

        await record_practice_completion(self.app_state, "learner", "study001", "chap0002")
        complete = await load_practice_progress(self.app_state, "learner")
        summary = complete.for_study("study001", ("chap0001", "chap0002"))
        self.assertEqual((summary.done, summary.total, summary.state), (2, 2, "done"))
        self.assertIsNone(complete.first_unfinished("study001", ("chap0001", "chap0002")))

    async def test_best_move_count_only_improves(self) -> None:
        await record_practice_completion(
            self.app_state, "learner", "study001", "chap0001", best_moves=12
        )
        await record_practice_completion(
            self.app_state, "learner", "study001", "chap0001", best_moves=15
        )
        await record_practice_completion(
            self.app_state, "learner", "study001", "chap0001", best_moves=9
        )

        progress = await load_practice_progress(self.app_state, "learner")
        chapter = progress.chapters[practice_progress_key("study001", "chap0001")]
        self.assertEqual(chapter.best_moves, 9)

    async def test_reset_removes_only_selected_chapter_keys(self) -> None:
        await record_practice_completion(self.app_state, "learner", "study001", "chap0001")
        await record_practice_completion(self.app_state, "learner", "study002", "chap0002")

        await reset_practice_chapters(
            self.app_state,
            "learner",
            (practice_progress_key("study001", "chap0001"),),
        )
        progress = await load_practice_progress(self.app_state, "learner")

        self.assertFalse(progress.is_complete("study001", "chap0001"))
        self.assertTrue(progress.is_complete("study002", "chap0002"))

    async def test_malformed_progress_entries_are_ignored(self) -> None:
        await self.db.practice.insert_one(
            {
                "_id": "learner",
                "chapters": {
                    "study001:chap0001": {"completedAt": "not-a-date"},
                    "study001:chap0002": "broken",
                },
            }
        )

        progress = await load_practice_progress(self.app_state, "learner")
        self.assertEqual(progress.chapters, {})


if __name__ == "__main__":
    unittest.main()
