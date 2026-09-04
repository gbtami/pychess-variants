from __future__ import annotations

import unittest
from types import SimpleNamespace
from typing import Any, cast

from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.storage import (
    StudyStorageError,
    add_chapter,
    chapter_previews,
    create_study_with_chapter,
    delete_chapter,
    delete_study,
    load_owned_chapter,
    load_owned_study,
    rename_chapter,
    rename_study,
    select_chapter,
    studies_for_owner,
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

    async def test_chapter_crud_keeps_lightweight_ordered_previews(self) -> None:
        study, first = await create_study_with_chapter(cast(Any, self.app_state), "owner")
        second = await add_chapter(cast(Any, self.app_state), study, first)
        third = await add_chapter(cast(Any, self.app_state), study, second, name="Third line")

        self.assertEqual(second.order, 2)
        self.assertEqual(third.order, 3)
        await rename_chapter(cast(Any, self.app_state), second, "  Sicilian  ")
        previews = await chapter_previews(cast(Any, self.app_state), study.id)
        self.assertEqual(
            previews,
            [
                {"id": first.id, "name": "Chapter 1", "order": 1},
                {"id": second.id, "name": "Sicilian", "order": 2},
                {"id": third.id, "name": "Third line", "order": 3},
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
