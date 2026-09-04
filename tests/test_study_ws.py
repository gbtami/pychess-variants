from __future__ import annotations

import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

from fairy.fairy_board import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.models import Study, StudyChapter
from study.mutations import StudyMutationService
from study.tree import StudyTree
from study.ws import finally_logic, init_ws, process_message
from ws_structs import StudyAddNodeIn

STUDY_ID = "study001"
CHAPTER_ID = "chapter1"
OWNER = "owner"


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []

    async def send_str(self, payload: str) -> None:
        self.sent.append(json.loads(payload))


class FakeUser:
    def __init__(self, username: str) -> None:
        self.username = username
        self.study_sockets: dict[str, set[Any]] = {}
        self.online = False

    def update_online(self) -> None:
        self.online = any(self.study_sockets.values())


class StudyWebsocketTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(
            db=self.db,
            catalogued_variants={},
            study_sockets={},
        )
        now = datetime(2026, 9, 4, 16, 0, tzinfo=UTC)
        self.study = Study(
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
        await self.db.study.insert_one(self.study.to_document())
        await self.db.study_chapter.insert_one(chapter.to_document())
        self.service = StudyMutationService(cast(Any, self.app_state))
        self.user = FakeUser(OWNER)

    async def _connect(self) -> FakeWebSocket:
        ws = FakeWebSocket()
        await init_ws(cast(Any, self.app_state), cast(Any, ws), cast(Any, self.user), self.study)
        return ws

    async def test_room_is_lazy_and_removed_after_last_socket(self) -> None:
        self.assertNotIn(STUDY_ID, self.app_state.study_sockets)
        ws = await self._connect()

        self.assertEqual(self.app_state.study_sockets[STUDY_ID], {ws})
        self.assertEqual(self.user.study_sockets[STUDY_ID], {ws})
        self.assertTrue(self.user.online)
        self.assertEqual(ws.sent[-1], {"type": "study_user_connected", "studyId": STUDY_ID})

        await finally_logic(
            cast(Any, self.app_state), cast(Any, ws), cast(Any, self.user), STUDY_ID
        )
        self.assertNotIn(STUDY_ID, self.app_state.study_sockets)
        self.assertNotIn(STUDY_ID, self.user.study_sockets)
        self.assertFalse(self.user.online)

    async def test_typed_add_broadcasts_same_stable_node_to_both_tabs(self) -> None:
        first = await self._connect()
        second = await self._connect()
        first.sent.clear()
        second.sent.clear()

        message = StudyAddNodeIn(
            type="study_add_node",
            studyId=STUDY_ID,
            chapterId=CHAPTER_ID,
            clientOpId="operation1",
            expectedRevision=0,
            parentPath="",
            move="e2e4",
            nodeId="Client0001",
        )
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            message,
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(len(first.sent), 1)
        self.assertEqual(first.sent, second.sent)
        payload = first.sent[0]
        self.assertEqual(payload["type"], "study_add_node")
        self.assertEqual(payload["clientOpId"], "operation1")
        self.assertEqual(payload["revision"], 1)
        self.assertTrue(payload["changed"])
        self.assertEqual(payload["path"], "Client0001")
        self.assertEqual(cast(dict[str, object], payload["node"])["id"], "Client0001")

    async def test_stale_second_tab_gets_reload_without_broadcast(self) -> None:
        first = await self._connect()
        second = await self._connect()
        first.sent.clear()
        second.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="first",
                expectedRevision=0,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        first.sent.clear()
        second.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, second),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="stale",
                expectedRevision=0,
                parentPath="",
                move="d2d4",
                nodeId="Client0002",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(first.sent, [])
        self.assertEqual(len(second.sent), 1)
        self.assertEqual(second.sent[0]["type"], "study_reload")
        self.assertEqual(second.sent[0]["revision"], 1)
        self.assertEqual(second.sent[0]["reason"], "revision_mismatch")

    async def test_wrong_embedded_study_id_is_rejected(self) -> None:
        ws = await self._connect()
        ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, ws),
            {
                "type": "study_add_node",
                "studyId": "other",
                "chapterId": CHAPTER_ID,
                "clientOpId": "operation1",
                "expectedRevision": 0,
                "parentPath": "",
                "move": "e2e4",
                "nodeId": "Client0001",
            },
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(len(ws.sent), 1)
        self.assertEqual(ws.sent[0]["type"], "study_error")
        self.assertEqual(ws.sent[0]["reason"], "invalid_message")
        chapter = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert chapter is not None
        self.assertEqual(chapter["revision"], 0)


if __name__ == "__main__":
    unittest.main()
