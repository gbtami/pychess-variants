from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import UTC, datetime

from study.models import Study
from study.permissions import (
    can_clone_study,
    can_embed_study,
    can_share_study,
    can_use_study_computer,
    can_use_study_explorer,
    can_view_study,
    can_write_study,
    study_feature_selection,
)


class StudyPermissionsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        now = datetime.now(UTC)
        self.study = Study(
            id="study001",
            name="Opening ideas",
            owner="owner",
            members={"owner": "write", "writer": "write", "reader": "read"},
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

    def test_feature_selections_follow_lichess_role_order(self) -> None:
        public = replace(self.study, visibility="public")
        viewers = {
            "owner": "owner",
            "writer": "writer",
            "reader": "reader",
            "other": "other",
            "anonymous": None,
        }
        expected = {
            "nobody": set(),
            "owner": {"owner"},
            "contributor": {"owner", "writer"},
            "member": {"owner", "writer", "reader"},
            "everyone": set(viewers),
        }
        for selection, allowed in expected.items():
            study = replace(public, settings={"computer": selection, "explorer": selection})
            for label, username in viewers.items():
                with self.subTest(selection=selection, viewer=label):
                    self.assertEqual(can_use_study_computer(study, username), label in allowed)
                    self.assertEqual(can_use_study_explorer(study, username), label in allowed)

    def test_missing_feature_settings_preserve_existing_everyone_behavior(self) -> None:
        public = replace(self.study, visibility="public")
        self.assertEqual(study_feature_selection(public, "computer"), "everyone")
        self.assertTrue(can_use_study_computer(public, None))
        self.assertTrue(can_share_study(public, None))

    def test_invalid_stored_feature_setting_fails_closed(self) -> None:
        public = replace(self.study, visibility="public", settings={"shareable": "surprise"})
        self.assertEqual(study_feature_selection(public, "shareable"), "nobody")
        self.assertFalse(can_share_study(public, "owner"))
        self.assertFalse(can_share_study(public, None))

    def test_signed_in_viewer_can_clone_only_when_selection_allows(self) -> None:
        self.assertTrue(can_clone_study(self.study, "owner"))
        self.assertTrue(can_clone_study(self.study, "reader"))
        self.assertFalse(can_clone_study(self.study, "other"))
        self.assertFalse(can_clone_study(self.study, None))

        public = replace(self.study, visibility="public", settings={"cloneable": "member"})
        self.assertTrue(can_clone_study(public, "owner"))
        self.assertTrue(can_clone_study(public, "reader"))
        self.assertFalse(can_clone_study(public, "other"))
        self.assertFalse(can_clone_study(public, None))

    def test_only_non_private_studies_are_embeddable_independent_of_share_setting(self) -> None:
        self.assertFalse(can_embed_study(self.study))
        self.assertTrue(can_embed_study(replace(self.study, visibility="unlisted")))
        self.assertTrue(can_embed_study(replace(self.study, visibility="public")))
        self.assertTrue(
            can_embed_study(
                replace(self.study, visibility="public", settings={"shareable": "member"})
            )
        )

    def test_only_write_members_can_persist_changes(self) -> None:
        study = replace(self.study, visibility="public")
        self.assertTrue(can_write_study(study, "owner"))
        self.assertTrue(can_write_study(study, "writer"))
        self.assertFalse(can_write_study(study, "reader"))
        self.assertFalse(can_write_study(study, "other"))
        self.assertFalse(can_write_study(study, None))


if __name__ == "__main__":
    unittest.main()
