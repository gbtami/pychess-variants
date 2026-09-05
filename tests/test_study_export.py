from __future__ import annotations

import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from aiohttp import web
from mongomock_motor import AsyncMongoMockClient
from study.annotations import StudyAnnotations, StudyComment, StudyShape
from study.models import Study, StudyChapter
from study.tree import StudyTree, StudyTreeNode
from views.study import study_chapter_export_data


class StudyExportDataTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db)
        now = datetime(2026, 9, 5, 8, 0, tzinfo=UTC)
        self.study = Study(
            id="study001",
            name="Opening Lab",
            owner="owner",
            members={"owner": "write"},
            created_at=now,
            updated_at=now,
        )
        root_annotations = StudyAnnotations(
            shapes=(StudyShape("e4", brush="green"),),
            comments=(StudyComment("Comment001", "owner", "Root note"),),
            nags=(3,),
        )
        chapter = StudyChapter(
            id="chapter1",
            study_id=self.study.id,
            name="Main line",
            order=1,
            owner="owner",
            variant="custom",
            initial_fen="8/8/8/8/8/8/8/8 w - - 0 1",
            orientation="white",
            variant_ini="[custom:chess]\nmaxRank = 8",
            description="Plans",
            tags={"Event": "Custom"},
            root=StudyTree(
                {
                    "Node000001": StudyTreeNode(
                        id="Node000001",
                        parent_id=None,
                        order=0,
                        move="a1a2",
                        fen="8/8/8/8/8/8/P7/8 b - - 0 1",
                        turn_color="black",
                        san="a2",
                        san_san="a2",
                    )
                },
                root_annotations=root_annotations,
            ),
            created_at=now,
            updated_at=now,
        )
        await self.db.study.insert_one(self.study.to_document())
        await self.db.study_chapter.insert_one(chapter.to_document())

    async def _request_as(self, username: str) -> web.StreamResponse:
        request = SimpleNamespace(
            app=object(),
            match_info={"studyId": self.study.id, "chapterId": "chapter1"},
        )
        user = SimpleNamespace(username=username, anon=False, bot=False)
        with (
            patch("views.study.get_user_context", return_value=(user, {})),
            patch("views.study.get_app_state", return_value=self.app_state),
        ):
            return await study_chapter_export_data(cast(Any, request))

    async def test_owner_gets_raw_chapter_data_without_server_pgn_rendering(self) -> None:
        response = await self._request_as("owner")
        self.assertEqual(response.status, 200)
        payload = json.loads(response.body)
        self.assertEqual(payload["id"], "chapter1")
        self.assertEqual(payload["variant"], "custom")
        self.assertEqual(payload["variantIni"], "[custom:chess]\nmaxRank = 8")
        self.assertEqual(payload["description"], "Plans")
        self.assertEqual(payload["tags"], {"Event": "Custom"})
        self.assertEqual(payload["tree"]["rootAnnotations"]["nags"], [3])
        self.assertEqual(payload["tree"]["nodes"][0]["sanSAN"], "a2")

    async def test_other_user_cannot_fetch_private_chapter_export_data(self) -> None:
        with self.assertRaises(web.HTTPNotFound):
            await self._request_as("intruder")


if __name__ == "__main__":
    unittest.main()
