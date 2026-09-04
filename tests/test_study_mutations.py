from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from fairy.fairy_board import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.models import Study, StudyChapter
from study.mutations import StudyMutationService
from study.tree import StudyTree

STUDY_ID = "study001"
CHAPTER_ID = "chapter1"
OWNER = "owner"


class StudyMutationServiceTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db, catalogued_variants={})
        self.service = StudyMutationService(cast(Any, self.app_state))
        now = datetime(2026, 9, 4, 13, 0, tzinfo=UTC)
        study = Study(
            id=STUDY_ID,
            name="Study",
            owner=OWNER,
            members={OWNER: "write"},
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

    async def _chapter(self) -> StudyChapter:
        doc = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert doc is not None
        return StudyChapter.from_document(doc)

    async def _add(self, move: str, revision: int, parent_path: str = ""):
        return await self.service.add_node(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            parent_path=parent_path,
            move=move,
            expected_revision=revision,
        )

    async def test_add_node_is_authoritative_and_deduplicates(self) -> None:
        added = await self._add("e2e4", 0)
        self.assertEqual(added.status, "ok")
        self.assertTrue(added.changed)
        self.assertEqual(added.revision, 1)
        self.assertIsNotNone(added.node)
        assert added.node is not None
        self.assertEqual(added.node.san, "e4")
        self.assertEqual(added.node.san_san, "e4")
        self.assertEqual(added.node.turn_color, "black")
        self.assertEqual(added.path, added.node.id)

        chapter = await self._chapter()
        self.assertEqual(chapter.revision, 1)
        self.assertEqual(chapter.root.nodes[added.node.id], added.node)

        duplicate = await self._add("e2e4", 1)
        self.assertEqual(duplicate.status, "ok")
        self.assertFalse(duplicate.changed)
        self.assertEqual(duplicate.revision, 1)
        self.assertEqual(duplicate.node, added.node)
        self.assertEqual((await self._chapter()).revision, 1)

    async def test_add_rejects_illegal_move_and_stale_revision(self) -> None:
        illegal = await self._add("e2e5", 0)
        self.assertEqual(illegal.status, "error")
        self.assertEqual(illegal.reason, "illegal_move")
        self.assertEqual((await self._chapter()).revision, 0)

        added = await self._add("e2e4", 0)
        self.assertEqual(added.status, "ok")
        stale = await self._add("d2d4", 0)
        self.assertEqual(stale.status, "reload")
        self.assertEqual(stale.reason, "revision_mismatch")
        self.assertEqual(stale.revision, 1)

    async def test_atomic_revision_guard_catches_race_after_initial_load(self) -> None:
        collection = self.db.study_chapter
        injected = False

        class RacingCollection:
            async def find_one(inner_self, *args, **kwargs):
                return await collection.find_one(*args, **kwargs)

            async def update_one(inner_self, query, update, *args, **kwargs):
                nonlocal injected
                if not injected and query.get("revision") == 0:
                    injected = True
                    await collection.update_one({"_id": CHAPTER_ID}, {"$set": {"revision": 1}})
                return await collection.update_one(query, update, *args, **kwargs)

        self.service.db = SimpleNamespace(
            study=self.db.study,
            study_chapter=RacingCollection(),
        )
        result = await self._add("e2e4", 0)

        self.assertEqual(result.status, "reload")
        self.assertEqual(result.reason, "revision_mismatch")
        self.assertEqual(result.revision, 1)
        chapter = await self._chapter()
        self.assertEqual(chapter.revision, 1)
        self.assertEqual(chapter.root.count(), 0)

    async def test_owner_only_and_invalid_path_are_structured_results(self) -> None:
        forbidden = await self.service.add_node(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username="other",
            parent_path="",
            move="e2e4",
            expected_revision=0,
        )
        self.assertEqual(forbidden.status, "error")
        self.assertEqual(forbidden.reason, "forbidden")

        invalid_path = await self.service.add_node(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            parent_path="NotANode01",
            move="e2e4",
            expected_revision=0,
        )
        self.assertEqual(invalid_path.status, "reload")
        self.assertEqual(invalid_path.reason, "invalid_path")

    async def test_delete_branch_removes_descendants_and_renumbers_siblings(self) -> None:
        e4 = await self._add("e2e4", 0)
        d4 = await self._add("d2d4", 1)
        assert e4.path is not None and d4.node is not None
        e5 = await self._add("e7e5", 2, e4.path)
        assert e5.path is not None
        nf3 = await self._add("g1f3", 3, e5.path)
        assert nf3.path is not None

        deleted = await self.service.delete_node(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=e4.path,
            expected_revision=4,
        )
        self.assertEqual(deleted.status, "ok")
        self.assertTrue(deleted.changed)
        self.assertEqual(deleted.revision, 5)

        chapter = await self._chapter()
        self.assertEqual(chapter.root.count(), 1)
        remaining = chapter.root.children_of(None)
        self.assertEqual([node.id for node in remaining], [d4.node.id])
        self.assertEqual(remaining[0].order, 0)

    async def test_promote_matches_client_one_level_and_to_mainline_semantics(self) -> None:
        e4 = await self._add("e2e4", 0)
        d4 = await self._add("d2d4", 1)
        assert e4.path is not None and d4.path is not None
        e5 = await self._add("e7e5", 2, e4.path)
        c5 = await self._add("c7c5", 3, e4.path)
        assert e5.node is not None and c5.path is not None and c5.node is not None

        promoted = await self.service.promote_variation(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=c5.path,
            to_mainline=False,
            expected_revision=4,
        )
        self.assertEqual(promoted.status, "ok")
        chapter = await self._chapter()
        self.assertEqual(
            [node.id for node in chapter.root.children_of(e4.node.id)],
            [c5.node.id, e5.node.id],
        )
        self.assertEqual(
            [node.id for node in chapter.root.children_of(None)], [e4.node.id, d4.node.id]
        )

        to_mainline = await self.service.promote_variation(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=d4.path,
            to_mainline=True,
            expected_revision=5,
        )
        self.assertEqual(to_mainline.status, "ok")
        chapter = await self._chapter()
        self.assertEqual(
            [node.id for node in chapter.root.children_of(None)], [d4.node.id, e4.node.id]
        )

    async def test_force_variation_keeps_only_one_marker(self) -> None:
        e4 = await self._add("e2e4", 0)
        d4 = await self._add("d2d4", 1)
        assert (
            e4.path is not None
            and d4.path is not None
            and e4.node is not None
            and d4.node is not None
        )

        first = await self.service.force_variation(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=e4.path,
            force=True,
            expected_revision=2,
        )
        self.assertEqual(first.revision, 3)

        second = await self.service.force_variation(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=d4.path,
            force=True,
            expected_revision=3,
        )
        self.assertEqual(second.revision, 4)
        chapter = await self._chapter()
        self.assertFalse(chapter.root.nodes[e4.node.id].force_variation)
        self.assertTrue(chapter.root.nodes[d4.node.id].force_variation)

        noop = await self.service.force_variation(
            study_id=STUDY_ID,
            chapter_id=CHAPTER_ID,
            username=OWNER,
            path=d4.path,
            force=True,
            expected_revision=4,
        )
        self.assertEqual(noop.status, "ok")
        self.assertFalse(noop.changed)
        self.assertEqual(noop.revision, 4)

    async def test_node_and_bson_limits_reject_without_partial_write(self) -> None:
        first = await self._add("e2e4", 0)
        self.assertEqual(first.revision, 1)

        with patch("study.mutations.STUDY_MAX_NODES_PER_CHAPTER", 1):
            limited = await self._add("d2d4", 1)
        self.assertEqual(limited.status, "error")
        self.assertEqual(limited.reason, "node_limit")
        self.assertEqual((await self._chapter()).revision, 1)

        with patch("study.mutations.STUDY_CHAPTER_MAX_BSON_BYTES", 1):
            overweight = await self._add("d2d4", 1)
        self.assertEqual(overweight.status, "error")
        self.assertEqual(overweight.reason, "chapter_too_large")
        chapter = await self._chapter()
        self.assertEqual(chapter.revision, 1)
        self.assertEqual(chapter.root.count(), 1)

    def test_catalogued_snapshot_restores_current_active_definition(self) -> None:
        snapshot = "[studycustom:chess]\ncustomPiece1 = a:KN\n"
        current = "[studycustom:chess]\ncustomPiece1 = a:BN\n"
        self.app_state.catalogued_variants["studycustom"] = {"ini": current}
        now = datetime(2026, 9, 4, 13, 0, tzinfo=UTC)
        chapter = StudyChapter(
            id=CHAPTER_ID,
            study_id=STUDY_ID,
            name="Custom",
            order=1,
            owner=OWNER,
            variant="studycustom",
            initial_fen=FairyBoard.start_fen("chess"),
            orientation="white",
            root=StudyTree(),
            created_at=now,
            updated_at=now,
            variant_ini=snapshot,
        )

        with (
            patch("study.mutations.sf.load_variant_config") as load_config,
            self.service._chapter_variant(chapter),
        ):
            pass

        self.assertEqual([call.args[0] for call in load_config.call_args_list], [snapshot, current])


if __name__ == "__main__":
    unittest.main()
