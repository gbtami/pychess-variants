from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from aiohttp import web
from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.storage import create_study_with_chapter
from views.study import study_import_pgn


class StudyImportTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(db=self.db, catalogued_variants={})
        self.study, self.initial_chapter = await create_study_with_chapter(
            cast(Any, self.app_state), "owner", name="Import target"
        )

    @staticmethod
    def _node(node_id: str, move: str, *, parent_id: str | None = None, order: int = 0):
        return {
            "id": node_id,
            "parentId": parent_id,
            "order": order,
            "move": move,
            # These client-computed fields are intentionally wrong. The server import
            # builder must replay the move and replace them authoritatively.
            "fen": "client supplied",
            "turnColor": "white",
            "check": True,
            "san": "wrong",
            "sanSAN": "wrong",
        }

    def _chapter(self, move: str, *, name: str, node_id: str) -> dict[str, object]:
        return {
            "name": name,
            "variant": "chess",
            "chess960": False,
            "initialFen": FairyBoard.start_fen("chess"),
            "orientation": "black",
            "description": f"Description for {name}",
            "tags": {"Event": "Imported event"},
            "tree": {
                "rootAnnotations": {
                    "shapes": [],
                    "comments": [
                        {"id": "Comment001", "author": "spoofed", "text": "Root import note"}
                    ],
                    "nags": [3],
                },
                "nodes": [self._node(node_id, move)],
            },
        }

    async def _request(self, payload: dict[str, object], username: str = "owner"):
        request = SimpleNamespace(app=object(), match_info={"studyId": self.study.id})
        user = SimpleNamespace(username=username, anon=False, bot=False)
        with (
            patch("views.study.get_user_context", return_value=(user, {})),
            patch("views.study.get_app_state", return_value=self.app_state),
            patch("views.study.read_json_data", return_value=payload),
        ):
            return await study_import_pgn(cast(Any, request))

    async def test_imports_multiple_normalized_chapters_after_server_replay(self) -> None:
        response = await self._request(
            {
                "chapters": [
                    self._chapter("e2e4", name="One", node_id="Node000001"),
                    self._chapter("d2d4", name="Two", node_id="Node000002"),
                ]
            }
        )
        self.assertEqual(response.status, 200)
        result = json.loads(response.body)
        self.assertTrue(result["ok"])
        self.assertEqual(result["imported"], 2)

        docs = (
            await self.db.study_chapter.find({"studyId": self.study.id})
            .sort("order", 1)
            .to_list(10)
        )
        self.assertEqual([doc["name"] for doc in docs], ["Chapter 1", "One", "Two"])
        imported = docs[1]
        self.assertEqual(imported["description"], "Description for One")
        self.assertEqual(imported["tags"], {"Event": "Imported event"})
        node = next(value for key, value in imported["root"].items() if key != "_")
        self.assertEqual(node["m"], "e2e4")
        self.assertEqual(node["s"], "e4")
        self.assertFalse(node.get("c", False))
        self.assertIn("4P3", node["f"])
        self.assertEqual(imported["root"]["_"]["a"]["c"][0]["a"], "owner")

    async def test_rejects_illegal_later_chapter_without_partial_import(self) -> None:
        invalid = self._chapter("e2e5", name="Illegal", node_id="Node000004")
        response = await self._request(
            {
                "chapters": [
                    self._chapter("e2e4", name="Valid", node_id="Node000003"),
                    invalid,
                ]
            }
        )
        self.assertEqual(response.status, 400)
        result = json.loads(response.body)
        self.assertIn("Imported chapter 2", result["error"])
        self.assertEqual(await self.db.study_chapter.count_documents({"studyId": self.study.id}), 1)

    async def test_accepts_embedded_custom_variant_snapshot_without_live_catalog_entry(
        self,
    ) -> None:
        chapter = self._chapter("e2e4", name="Snapshot", node_id="Node000005")
        chapter["variant"] = "pgncustom"
        chapter["variantIni"] = (
            "[pgncustom:chess]\nstartFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n"
        )
        response = await self._request({"chapters": [chapter]})
        self.assertEqual(response.status, 200)

        doc = await self.db.study_chapter.find_one({"studyId": self.study.id, "name": "Snapshot"})
        assert doc is not None
        self.assertEqual(doc["variant"], "pgncustom")
        self.assertEqual(
            doc["variantIni"],
            "[pgncustom:chess]\nstartFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n",
        )
        node = next(value for key, value in doc["root"].items() if key != "_")
        self.assertEqual(node["m"], "e2e4")
        self.assertEqual(node["s"], "e4")

    async def test_other_user_cannot_import_into_private_study(self) -> None:
        with self.assertRaises(web.HTTPNotFound):
            await self._request(
                {"chapters": [self._chapter("e2e4", name="Nope", node_id="Node000006")]},
                username="intruder",
            )


if __name__ == "__main__":
    unittest.main()
