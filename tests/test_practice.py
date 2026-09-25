from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

from mongomock_motor import AsyncMongoMockClient
from practice import (
    PracticeSection,
    PracticeStudyRef,
    build_practice_curriculum,
    validate_practice_study,
)
from study.models import Study, StudyChapterMode, StudyVisibility


class PracticeCurriculumTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db)

    async def _insert_study(self, study_id: str, *, visibility: StudyVisibility = "public") -> None:
        now = datetime.now(UTC)
        study = Study(
            id=study_id,
            name=f"Study {study_id}",
            owner="author",
            members={"author": "write"},
            visibility=visibility,
            created_at=now,
            updated_at=now,
        )
        await self.db.study.insert_one(study.to_document())

    async def _insert_chapter(
        self,
        study_id: str,
        chapter_id: str,
        *,
        order: int,
        variant: str = "chess",
        chess960: bool = False,
        mode: StudyChapterMode = "gamebook",
    ) -> None:
        await self.db.study_chapter.insert_one(
            {
                "_id": chapter_id,
                "studyId": study_id,
                "name": f"Chapter {order}",
                "order": order,
                "variant": variant,
                "chess960": chess960,
                "mode": mode,
            }
        )

    async def test_valid_public_single_variant_study_is_resolved(self) -> None:
        await self._insert_study("valid")
        await self._insert_chapter("valid", "c1", order=1, mode="gamebook")
        await self._insert_chapter("valid", "c2", order=2, mode="practice")
        section = PracticeSection(
            id="basics",
            name="Basics",
            studies=(
                PracticeStudyRef(
                    study_id="valid",
                    variant="chess",
                    description="Learn the basics",
                ),
            ),
        )

        curriculum = await build_practice_curriculum(cast(Any, self.app_state), sections=(section,))

        self.assertEqual(len(curriculum), 1)
        resolved = curriculum[0].studies[0]
        self.assertTrue(resolved.valid)
        self.assertEqual(resolved.study.name if resolved.study else None, "Study valid")
        self.assertEqual([chapter.id for chapter in resolved.chapters], ["c1", "c2"])
        self.assertEqual(curriculum[0].valid_studies, (resolved,))
        self.assertEqual(curriculum[0].invalid_studies, ())

    async def test_missing_study_returns_validation_reason(self) -> None:
        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("missing", "chess")
        )

        self.assertFalse(resolved.valid)
        self.assertIsNone(resolved.study)
        self.assertEqual([issue.code for issue in resolved.issues], ["study-not-found"])

    async def test_private_study_is_not_eligible(self) -> None:
        await self._insert_study("private", visibility="private")
        await self._insert_chapter("private", "c1", order=1)

        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("private", "chess")
        )

        self.assertFalse(resolved.valid)
        self.assertIn("not-public", {issue.code for issue in resolved.issues})

    async def test_mixed_variant_study_is_not_eligible(self) -> None:
        await self._insert_study("mixed")
        await self._insert_chapter("mixed", "c1", order=1, variant="chess")
        await self._insert_chapter("mixed", "c2", order=2, variant="atomic")

        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("mixed", "chess")
        )

        self.assertFalse(resolved.valid)
        self.assertIn("mixed-variant", {issue.code for issue in resolved.issues})

    async def test_normal_or_conceal_chapters_are_not_practice_eligible(self) -> None:
        await self._insert_study("bad-mode")
        await self._insert_chapter("bad-mode", "c1", order=1, mode="normal")
        await self._insert_chapter("bad-mode", "c2", order=2, mode="conceal")

        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("bad-mode", "chess")
        )

        self.assertFalse(resolved.valid)
        issue = next(issue for issue in resolved.issues if issue.code == "unsupported-mode")
        self.assertIn("conceal", issue.message)
        self.assertIn("normal", issue.message)

    async def test_registry_variant_and_random_start_identity_must_match(self) -> None:
        await self._insert_study("identity")
        await self._insert_chapter("identity", "c1", order=1, variant="atomic", chess960=True)

        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("identity", "chess", chess960=False)
        )

        self.assertFalse(resolved.valid)
        codes = {issue.code for issue in resolved.issues}
        self.assertIn("variant-mismatch", codes)
        self.assertIn("chess960-mismatch", codes)

    async def test_empty_public_study_is_not_eligible(self) -> None:
        await self._insert_study("empty")

        resolved = await validate_practice_study(
            cast(Any, self.app_state), PracticeStudyRef("empty", "chess")
        )

        self.assertFalse(resolved.valid)
        self.assertEqual([issue.code for issue in resolved.issues], ["no-chapters"])
