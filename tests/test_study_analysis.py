from __future__ import annotations

import asyncio
import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from fairy.fairy_board import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.analysis import merge_study_server_analysis, request_study_server_analysis
from study.models import Study, StudyChapter
from study.mutations import StudyMutationService
from study.tree import StudyTree

STUDY_ID = "study001"
CHAPTER_ID = "chapter1"
OWNER = "owner"


class StudyServerAnalysisTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(
            db=self.db,
            catalogued_variants={},
            fishnet_works={},
            fishnet_queue=asyncio.PriorityQueue(),
            fishnet_variant_payloads={},
            study_sockets={},
            study_mutation_locks={},
        )
        self.service = StudyMutationService(cast(Any, self.app_state))
        now = datetime(2026, 9, 7, 12, 0, tzinfo=UTC)
        study = Study(
            id=STUDY_ID,
            name="Server analysis",
            owner=OWNER,
            members={OWNER: "write", "writer": "write", "reader": "read"},
            created_at=now,
            updated_at=now,
        )
        chapter = StudyChapter(
            id=CHAPTER_ID,
            study_id=STUDY_ID,
            name="Chapter 1",
            order=1,
            owner=OWNER,
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            orientation="white",
            root=StudyTree(),
            created_at=now,
            updated_at=now,
        )
        await self.db.study.insert_one(study.to_document())
        await self.db.study_chapter.insert_one(chapter.to_document())

    async def _add_line(
        self, moves: list[str], *, start_revision: int = 0, parent_path: str = ""
    ) -> tuple[str, int]:
        path = parent_path
        revision = start_revision
        for move in moves:
            result = await self.service.add_node(
                study_id=STUDY_ID,
                chapter_id=CHAPTER_ID,
                username=OWNER,
                parent_path=path,
                move=move,
                expected_revision=revision,
            )
            self.assertEqual(result.status, "ok")
            self.assertTrue(result.changed)
            assert result.path is not None
            assert result.revision is not None
            path = result.path
            revision = result.revision
        return path, revision

    async def _request(self, username: str = OWNER):
        with patch("fishnet.has_available_fishnet_worker", return_value=True):
            return await request_study_server_analysis(
                cast(Any, self.app_state),
                study_id=STUDY_ID,
                chapter_id=CHAPTER_ID,
                username=username,
            )

    async def test_request_requires_contributor_and_five_move_mainline(self) -> None:
        await self._add_line(["e2e4", "e7e5", "g1f3", "b8c6"])

        too_short = await self._request()
        self.assertEqual(too_short.status, "too_short")
        self.assertEqual(self.app_state.fishnet_works, {})

        path, revision = await self._add_line(
            ["f1b5"],
            start_revision=4,
            parent_path=(await self._chapter()).root.preferred_mainline_path(),
        )
        self.assertEqual(revision, 5)

        forbidden = await self._request("reader")
        self.assertEqual(forbidden.status, "forbidden")
        self.assertEqual(self.app_state.fishnet_works, {})

        started = await self._request("writer")
        self.assertEqual(started.status, "started")
        self.assertIsNotNone(started.server_eval)
        work = next(iter(self.app_state.fishnet_works.values()))
        self.assertEqual(work["study_id"], STUDY_ID)
        self.assertEqual(work["chapter_id"], CHAPTER_ID)
        self.assertEqual(work["study_path"], path)
        self.assertEqual(work["variant"], "chess")
        self.assertEqual(work["position"], FairyBoard.start_fen("chess"))
        self.assertEqual(work["moves"], "e2e4 e7e5 g1f3 b8c6 f1b5")
        self.assertEqual(self.app_state.fishnet_queue.qsize(), 1)

        repeated = await self._request("writer")
        self.assertEqual(repeated.status, "already_requested")
        self.assertEqual(len(self.app_state.fishnet_works), 1)

    async def test_partial_progress_persists_then_completion_finishes_work(self) -> None:
        await self._add_line(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
        started = await self._request()
        self.assertEqual(started.status, "started")
        work_id, work = next(iter(self.app_state.fishnet_works.items()))

        partial = [
            {"score": {"cp": 18}, "depth": 14},
            {"score": {"cp": -12}, "depth": 14},
            None,
            None,
            None,
            None,
        ]
        await merge_study_server_analysis(cast(Any, self.app_state), work_id, work, partial)

        chapter = await self._chapter()
        self.assertIsNotNone(chapter.server_eval)
        assert chapter.server_eval is not None
        self.assertFalse(chapter.server_eval.done)
        self.assertEqual(chapter.server_eval.analysis[0], {"s": {"cp": 18}, "d": 14})
        self.assertEqual(chapter.server_eval.analysis[1], {"s": {"cp": -12}, "d": 14})
        self.assertIn(work_id, self.app_state.fishnet_works)

        complete = [
            {"score": {"cp": 20}, "depth": 18},
            {"score": {"cp": -10}, "depth": 18},
            {"score": {"cp": 24}, "depth": 18},
            {"score": {"cp": 5}, "depth": 18},
            {"score": {"cp": 35}, "depth": 18},
            {"score": {"cp": 15}, "depth": 18},
        ]
        await merge_study_server_analysis(cast(Any, self.app_state), work_id, work, complete)

        chapter = await self._chapter()
        self.assertIsNotNone(chapter.server_eval)
        assert chapter.server_eval is not None
        self.assertTrue(chapter.server_eval.done)
        self.assertEqual(len(chapter.server_eval.analysis), 6)
        self.assertNotIn(work_id, self.app_state.fishnet_works)

        repeated = await self._request()
        self.assertEqual(repeated.status, "already_done")

    async def test_interrupted_request_can_be_retried_after_cooldown(self) -> None:
        await self._add_line(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
        requested_at = datetime(2026, 9, 7, 12, 0, tzinfo=UTC)
        with patch("fishnet.has_available_fishnet_worker", return_value=True):
            started = await request_study_server_analysis(
                cast(Any, self.app_state),
                study_id=STUDY_ID,
                chapter_id=CHAPTER_ID,
                username=OWNER,
                now=requested_at,
            )
        self.assertEqual(started.status, "started")
        self.assertTrue(started.pending)

        # Simulate a server restart: persisted serverEval survives but the in-memory
        # Fishnet work queue does not. During the five-minute request window we
        # report the cooldown without pretending work is still running.
        self.app_state.fishnet_works.clear()
        while not self.app_state.fishnet_queue.empty():
            self.app_state.fishnet_queue.get_nowait()
            self.app_state.fishnet_queue.task_done()
        with patch("fishnet.has_available_fishnet_worker", return_value=True):
            cooling_down = await request_study_server_analysis(
                cast(Any, self.app_state),
                study_id=STUDY_ID,
                chapter_id=CHAPTER_ID,
                username=OWNER,
                now=requested_at + timedelta(minutes=4),
            )
        self.assertEqual(cooling_down.status, "already_requested")
        self.assertFalse(cooling_down.pending)
        self.assertEqual(self.app_state.fishnet_works, {})

        with patch("fishnet.has_available_fishnet_worker", return_value=True):
            retried = await request_study_server_analysis(
                cast(Any, self.app_state),
                study_id=STUDY_ID,
                chapter_id=CHAPTER_ID,
                username=OWNER,
                now=requested_at + timedelta(minutes=5),
            )
        self.assertEqual(retried.status, "started")
        self.assertTrue(retried.pending)
        self.assertEqual(len(self.app_state.fishnet_works), 1)

    async def test_server_eval_parser_rejects_malformed_scores(self) -> None:
        chapter = await self._chapter()
        doc = chapter.to_document()
        doc["serverEval"] = {
            "path": "StudyNode1",
            "done": False,
            "requestedAt": datetime(2026, 9, 7, 12, 0, tzinfo=UTC),
            "analysis": [{"s": {"cp": "not-a-number"}}],
        }
        with self.assertRaises(TypeError):
            StudyChapter.from_document(doc)

    async def test_mainline_change_invalidates_analysis_and_drops_queued_work(self) -> None:
        path, revision = await self._add_line(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
        started = await self._request()
        self.assertEqual(started.status, "started")
        self.assertEqual(len(self.app_state.fishnet_works), 1)

        extended = await self.service.add_node(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            parent_path=path,
            move="a7a6",
            expected_revision=revision,
        )
        self.assertEqual(extended.status, "ok")
        self.assertTrue(extended.changed)
        self.assertEqual(self.app_state.fishnet_works, {})

        chapter_doc = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert chapter_doc is not None
        self.assertNotIn("serverEval", chapter_doc)

    async def _chapter(self) -> StudyChapter:
        doc = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert doc is not None
        return StudyChapter.from_document(doc)


if __name__ == "__main__":
    unittest.main()
