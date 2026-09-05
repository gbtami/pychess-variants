from __future__ import annotations

import string
import unittest
from datetime import UTC, datetime

from database.schema import COLLECTIONS_BY_NAME, INDEXES_BY_COLLECTION
from study.constants import (
    MONGO_MAX_DOCUMENT_BYTES,
    STUDY_CHAPTER_MAX_BSON_BYTES,
    STUDY_MAX_CHAPTERS,
    STUDY_MAX_NODES_PER_CHAPTER,
)
from study.models import Study, StudyChapter, StudySource, make_chapter, make_study
from study.tree import StudyTree, StudyTreeNode


class StudySchemaTestCase(unittest.TestCase):
    def test_owner_only_mvp_schema(self) -> None:
        self.assertIn("study", COLLECTIONS_BY_NAME)
        self.assertIn("study_chapter", COLLECTIONS_BY_NAME)

        study_indexes = INDEXES_BY_COLLECTION["study"]
        self.assertEqual(len(study_indexes), 1)
        self.assertEqual(study_indexes[0].key, (("owner", 1), ("updatedAt", -1)))

        chapter_indexes = INDEXES_BY_COLLECTION["study_chapter"]
        self.assertEqual(len(chapter_indexes), 1)
        self.assertEqual(chapter_indexes[0].key, (("studyId", 1), ("order", 1)))

    def test_limits_keep_bson_headroom(self) -> None:
        self.assertGreater(STUDY_MAX_CHAPTERS, 0)
        self.assertGreater(STUDY_MAX_NODES_PER_CHAPTER, 0)
        self.assertGreater(STUDY_CHAPTER_MAX_BSON_BYTES, 0)
        self.assertLess(STUDY_CHAPTER_MAX_BSON_BYTES, MONGO_MAX_DOCUMENT_BYTES)


class StudyModelTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_make_and_round_trip_private_study(self) -> None:
        now = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)
        study = await make_study(None, owner="gbtami", now=now)

        self.assertEqual(len(study.id), 8)
        self.assertTrue(set(study.id) <= set(string.ascii_letters + string.digits))
        self.assertEqual(study.name, "gbtami's Study")
        self.assertEqual(study.members, {"gbtami": "write"})
        self.assertEqual(study.visibility, "private")
        self.assertEqual(study.source, StudySource())

        restored = Study.from_document(study.to_document())
        self.assertEqual(restored, study)

    async def test_make_and_round_trip_variant_chapter(self) -> None:
        now = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)
        chapter = await make_chapter(
            None,
            study_id="Study001",
            owner="gbtami",
            variant="my-custom-variant",
            chess960=True,
            initial_fen="8/8/8/8/8/8/8/8 w - - 0 1",
            orientation="black",
            variant_ini="[my-custom-variant]\nmaxRank = 8\n",
            root=StudyTree(
                {
                    "StudyNode1": StudyTreeNode(
                        id="StudyNode1",
                        parent_id=None,
                        order=0,
                        move="a1a2",
                        fen="8/8/8/8/8/8/P7/8 b - - 0 1",
                        turn_color="black",
                        san="a2",
                        san_san="a2",
                    )
                }
            ),
            order=2,
            now=now,
        )

        restored = StudyChapter.from_document(chapter.to_document())
        self.assertEqual(restored, chapter)
        self.assertEqual(restored.name, "Chapter 2")

    async def test_chapter_description_and_tags_are_canonicalized_and_round_trip(self) -> None:
        now = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)
        chapter = StudyChapter(
            id="chapter1",
            study_id="study001",
            name="Chapter 1",
            order=1,
            owner="owner",
            variant="chess",
            initial_fen="start",
            orientation="white",
            root=StudyTree(),
            description="  Line one\r\nLine two  ",
            tags={"Site": "  PyChess  ", "Event": "Test", "Empty": "  "},
            created_at=now,
            updated_at=now,
        )

        doc = chapter.to_document()
        self.assertEqual(doc["description"], "Line one\nLine two")
        self.assertEqual(doc["tags"], {"Event": "Test", "Site": "PyChess"})
        restored = StudyChapter.from_document(doc)
        self.assertEqual(restored.description, "Line one\nLine two")
        self.assertEqual(restored.tags, {"Event": "Test", "Site": "PyChess"})

    def test_source_round_trip(self) -> None:
        source = StudySource("game", "abcdefgh")
        self.assertEqual(StudySource.decode(source.encode()), source)

    def test_rejects_owner_without_write_membership(self) -> None:
        now = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)
        study = Study(
            id="abcdefgh",
            name="Study",
            owner="owner",
            members={"owner": "read"},
            created_at=now,
            updated_at=now,
        )
        with self.assertRaisesRegex(ValueError, "write member"):
            study.to_document()

    def test_optional_fields_are_omitted_from_compact_documents(self) -> None:
        now = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)
        chapter = StudyChapter(
            id="chapter1",
            study_id="study001",
            name="Chapter 1",
            order=1,
            owner="owner",
            variant="chess",
            initial_fen="start",
            orientation="white",
            root=StudyTree(),
            created_at=now,
            updated_at=now,
        )
        doc = chapter.to_document()
        self.assertNotIn("chess960", doc)
        self.assertNotIn("variantIni", doc)
        self.assertNotIn("description", doc)
        self.assertNotIn("tags", doc)


if __name__ == "__main__":
    unittest.main()
