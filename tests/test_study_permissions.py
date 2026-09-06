from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import UTC, datetime

from study.models import Study
from study.permissions import can_view_study, can_write_study


class StudyPermissionsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        now = datetime.now(UTC)
        self.study = Study(
            id="study001",
            name="Opening ideas",
            owner="owner",
            members={"owner": "write", "reader": "read"},
            created_at=now,
            updated_at=now,
        )

    def test_private_study_is_visible_only_to_members(self) -> None:
        self.assertTrue(can_view_study(self.study, "owner"))
        self.assertTrue(can_view_study(self.study, "reader"))
        self.assertFalse(can_view_study(self.study, "other"))
        self.assertFalse(can_view_study(self.study, None))

    def test_unlisted_and_public_studies_are_visible_by_link(self) -> None:
        for visibility in ("unlisted", "public"):
            with self.subTest(visibility=visibility):
                study = replace(self.study, visibility=visibility)
                self.assertTrue(can_view_study(study, "other"))
                self.assertTrue(can_view_study(study, None))

    def test_view_permission_does_not_grant_write_permission(self) -> None:
        study = replace(self.study, visibility="public")
        self.assertTrue(can_write_study(study, "owner"))
        self.assertFalse(can_write_study(study, "reader"))
        self.assertFalse(can_write_study(study, "other"))
        self.assertFalse(can_write_study(study, None))


if __name__ == "__main__":
    unittest.main()
