from __future__ import annotations

import unittest
from dataclasses import replace
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.builder import StudyChapterDraft
from study.models import StudySource
from study.storage import (
    StudyStorageError,
    add_chapter,
    add_chapter_from_draft,
    add_study_member,
    chapter_previews,
    clone_study,
    count_studies_for_owner_view,
    create_study_from_draft,
    create_study_with_chapter,
    delete_chapter,
    delete_study,
    edit_chapter_metadata,
    leave_study,
    load_owned_chapter,
    load_owned_study,
    remove_study_member,
    rename_chapter,
    rename_study,
    select_chapter,
    set_study_member_role,
    set_study_visibility,
    studies_for_owner,
    studies_for_owner_view,
)


class StudyStorageTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db)

    async def test_create_list_and_owner_lookup(self) -> None:
        study, chapter = await create_study_with_chapter(
            cast(Any, self.app_state), "owner", name="Opening ideas"
        )

        self.assertEqual(study.current_chapter, chapter.id)
        self.assertEqual(chapter.variant, "chess")
        self.assertEqual(chapter.initial_fen, FairyBoard.start_fen("chess"))
        self.assertEqual(chapter.order, 1)

        loaded = await load_owned_study(cast(Any, self.app_state), study.id, "owner")
        assert loaded is not None
        self.assertEqual(
            (loaded.id, loaded.name, loaded.current_chapter), (study.id, study.name, chapter.id)
        )
        self.assertIsNone(await load_owned_study(cast(Any, self.app_state), study.id, "other"))
        listed = (await studies_for_owner(cast(Any, self.app_state), "owner"))[0]
        self.assertEqual((listed.id, listed.name), (study.id, study.name))

    async def test_owner_view_listing_keeps_unlisted_and_private_out_of_profiles(self) -> None:
        private, _ = await create_study_with_chapter(
            cast(Any, self.app_state), "owner", name="Private ideas"
        )
        unlisted, _ = await create_study_with_chapter(
            cast(Any, self.app_state), "owner", name="Link-only ideas"
        )
        public, _ = await create_study_with_chapter(
            cast(Any, self.app_state), "owner", name="Public ideas"
        )
        await set_study_visibility(cast(Any, self.app_state), unlisted, "unlisted")
        await set_study_visibility(cast(Any, self.app_state), public, "public")

        owner_ids = {
            study.id
            for study in await studies_for_owner_view(cast(Any, self.app_state), "owner", "owner")
        }
        public_ids = {
            study.id
            for study in await studies_for_owner_view(cast(Any, self.app_state), "owner", None)
        }
        other_ids = {
            study.id
            for study in await studies_for_owner_view(cast(Any, self.app_state), "owner", "other")
        }

        self.assertEqual(owner_ids, {private.id, unlisted.id, public.id})
        self.assertEqual(public_ids, {public.id})
        self.assertEqual(other_ids, {public.id})
        self.assertEqual(
            await count_studies_for_owner_view(cast(Any, self.app_state), "owner", "owner"), 3
        )
        self.assertEqual(
            await count_studies_for_owner_view(cast(Any, self.app_state), "owner", "other"), 1
        )

    async def test_member_lifecycle_preserves_owner_and_enforces_cap(self) -> None:
        study, _ = await create_study_with_chapter(cast(Any, self.app_state), "owner")

        study = await add_study_member(
            cast(Any, self.app_state), study.id, "owner", "writer", "write"
        )
        self.assertEqual(study.members, {"owner": "write", "writer": "write"})

        study = await set_study_member_role(
            cast(Any, self.app_state), study.id, "owner", "writer", "read"
        )
        self.assertEqual(study.members["writer"], "read")

        with (
            patch("study.storage.STUDY_MAX_MEMBERS", 2),
            self.assertRaisesRegex(StudyStorageError, "at most 2 members"),
        ):
            await add_study_member(cast(Any, self.app_state), study.id, "owner", "third")

        study = await remove_study_member(cast(Any, self.app_state), study.id, "owner", "writer")
        self.assertEqual(study.members, {"owner": "write"})

        study = await add_study_member(cast(Any, self.app_state), study.id, "owner", "reader")
        study = await leave_study(cast(Any, self.app_state), study.id, "reader")
        self.assertEqual(study.members, {"owner": "write"})

        with self.assertRaisesRegex(StudyStorageError, "owner cannot"):
            await leave_study(cast(Any, self.app_state), study.id, "owner")
        with self.assertRaisesRegex(StudyStorageError, "Only the Study owner"):
            await add_study_member(cast(Any, self.app_state), study.id, "reader", "other")

    async def test_create_from_draft_persists_source_tree_and_variant_snapshot(self) -> None:
        draft = StudyChapterDraft(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            variant_ini="[snapshot:chess]",
            name="Imported",
            source=StudySource("game", "game0001"),
        )
        study, chapter = await create_study_from_draft(
            cast(Any, self.app_state), "owner", draft, name="Saved analysis"
        )
        self.assertEqual(study.source, StudySource("game", "game0001"))
        self.assertEqual(chapter.name, "Imported")
        self.assertEqual(chapter.variant_ini, "[snapshot:chess]")
        loaded = await load_owned_chapter(cast(Any, self.app_state), study.id, chapter.id, "owner")
        assert loaded is not None
        self.assertEqual(loaded.id, chapter.id)
        self.assertEqual(loaded.name, chapter.name)
        self.assertEqual(loaded.variant_ini, chapter.variant_ini)
        self.assertEqual(loaded.root, chapter.root)

    async def test_create_from_draft_enforces_chapter_bson_limit(self) -> None:
        draft = StudyChapterDraft(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
        )
        with (
            patch("study.storage.STUDY_CHAPTER_MAX_BSON_BYTES", 1),
            self.assertRaisesRegex(StudyStorageError, "too large"),
        ):
            await create_study_from_draft(cast(Any, self.app_state), "owner", draft)
        self.assertEqual(await self.db.study.count_documents({}), 0)
        self.assertEqual(await self.db.study_chapter.count_documents({}), 0)

    async def test_clone_study_copies_content_with_fresh_private_ownership(self) -> None:
        first_draft = StudyChapterDraft(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            variant_ini="[snapshot:chess]",
            name="Main line",
            description="Source description",
            tags={"Event": "Clone test"},
        )
        study, first = await create_study_from_draft(
            cast(Any, self.app_state), "owner", first_draft, name="Opening ideas"
        )
        second_draft = StudyChapterDraft(
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            name="Second line",
            orientation="black",
            tags={"Chapter": "Two"},
        )
        second = await add_chapter_from_draft(cast(Any, self.app_state), study, second_draft)
        source = replace(study, settings={"example": "preserved"})

        cloned, cloned_first = await clone_study(cast(Any, self.app_state), source, "cloner")

        self.assertNotEqual(cloned.id, study.id)
        self.assertEqual(cloned.name, study.name)
        self.assertEqual(cloned.owner, "cloner")
        self.assertEqual(cloned.members, {"cloner": "write"})
        self.assertEqual(cloned.visibility, "private")
        self.assertEqual(cloned.source, StudySource("study", study.id))
        self.assertEqual(cloned.settings, {"example": "preserved"})
        self.assertEqual(cloned.revision, 0)
        self.assertEqual(cloned.current_chapter, cloned_first.id)
        self.assertNotEqual(cloned_first.id, first.id)

        source_chapters = [first, second]
        cloned_docs = (
            await self.db.study_chapter.find({"studyId": cloned.id})
            .sort("order", 1)
            .to_list(length=10)
        )
        self.assertEqual(len(cloned_docs), 2)
        self.assertTrue({doc["_id"] for doc in cloned_docs}.isdisjoint({first.id, second.id}))
        for original, doc in zip(source_chapters, cloned_docs, strict=True):
            self.assertEqual(doc["owner"], "cloner")
            self.assertEqual(doc["studyId"], cloned.id)
            self.assertEqual(doc["name"], original.name)
            self.assertEqual(doc["order"], original.order)
            self.assertEqual(doc["variant"], original.variant)
            self.assertEqual(doc["initialFen"], original.initial_fen)
            self.assertEqual(doc["orientation"], original.orientation)
            self.assertEqual(doc.get("variantIni"), original.variant_ini)
            self.assertEqual(doc.get("description", ""), original.description)
            self.assertEqual(doc.get("tags", {}), dict(original.tags))
            self.assertEqual(doc["root"], original.root.to_document())
            self.assertEqual(doc["revision"], 0)

    async def test_chapter_crud_keeps_lightweight_ordered_previews(self) -> None:
        study, first = await create_study_with_chapter(cast(Any, self.app_state), "owner")
        second = await add_chapter(cast(Any, self.app_state), study, first)
        third = await add_chapter(cast(Any, self.app_state), study, second, name="Third line")

        self.assertEqual(second.order, 2)
        self.assertEqual(third.order, 3)
        await rename_chapter(cast(Any, self.app_state), second, "  Sicilian  ")
        await edit_chapter_metadata(
            cast(Any, self.app_state),
            third,
            name="Third line",
            orientation="black",
        )
        previews = await chapter_previews(cast(Any, self.app_state), study.id)
        self.assertEqual(
            previews,
            [
                {"id": first.id, "name": "Chapter 1", "order": 1, "orientation": "white"},
                {"id": second.id, "name": "Sicilian", "order": 2, "orientation": "white"},
                {"id": third.id, "name": "Third line", "order": 3, "orientation": "black"},
            ],
        )

        # Delete a middle chapter and compact the display order.
        next_id = await delete_chapter(cast(Any, self.app_state), study, second)
        self.assertEqual(next_id, first.id)
        previews = await chapter_previews(cast(Any, self.app_state), study.id)
        self.assertEqual([item["order"] for item in previews], [1, 2])
        self.assertEqual([item["id"] for item in previews], [first.id, third.id])

    async def test_select_and_delete_current_chapter_prefers_adjacent(self) -> None:
        study, first = await create_study_with_chapter(cast(Any, self.app_state), "owner")
        second = await add_chapter(cast(Any, self.app_state), study, first)
        third = await add_chapter(cast(Any, self.app_state), study, second)

        await select_chapter(cast(Any, self.app_state), study, second)
        selected = await load_owned_study(cast(Any, self.app_state), study.id, "owner")
        assert selected is not None
        self.assertEqual(selected.current_chapter, second.id)

        next_id = await delete_chapter(cast(Any, self.app_state), selected, second)
        self.assertEqual(next_id, third.id)
        loaded = await load_owned_study(cast(Any, self.app_state), study.id, "owner")
        assert loaded is not None
        self.assertEqual(loaded.current_chapter, third.id)

        previews = await chapter_previews(cast(Any, self.app_state), study.id)
        self.assertEqual([item["id"] for item in previews], [first.id, third.id])
        self.assertEqual([item["order"] for item in previews], [1, 2])

    async def test_cannot_delete_last_chapter(self) -> None:
        study, chapter = await create_study_with_chapter(cast(Any, self.app_state), "owner")
        with self.assertRaisesRegex(StudyStorageError, "at least one chapter"):
            await delete_chapter(cast(Any, self.app_state), study, chapter)

    async def test_rename_and_delete_study(self) -> None:
        study, chapter = await create_study_with_chapter(cast(Any, self.app_state), "owner")
        name = await rename_study(cast(Any, self.app_state), study, "  My repertoire  ")
        self.assertEqual(name, "My repertoire")
        loaded = await load_owned_study(cast(Any, self.app_state), study.id, "owner")
        assert loaded is not None
        self.assertEqual(loaded.name, "My repertoire")

        loaded_chapter = await load_owned_chapter(
            cast(Any, self.app_state), study.id, chapter.id, "owner"
        )
        self.assertIsNotNone(loaded_chapter)
        await delete_study(cast(Any, self.app_state), loaded)
        self.assertIsNone(await self.db.study.find_one({"_id": study.id}))
        self.assertEqual(await self.db.study_chapter.count_documents({"studyId": study.id}), 0)


if __name__ == "__main__":
    unittest.main()
