from __future__ import annotations

import asyncio
import json
import unittest
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

from fairy.fairy_board import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.models import Study, StudyChapter
from study.mutations import StudyMutationService
from study.permissions import can_view_study
from study.sequencer import sequence_study
from study.snapshot import chapter_snapshot_token
from study.tree import StudyTree
from study.ws import (
    broadcast_study_members,
    broadcast_study_topics,
    finally_logic,
    init_ws,
    process_message,
)
from ws_structs import (
    StudyAddNodeIn,
    StudyDeleteNodeIn,
    StudyPromoteVariationIn,
    StudySetCommentIn,
    StudySetDescriptionIn,
    StudySetPositionIn,
    StudySetShapesIn,
    StudySetTagsIn,
    StudySyncChapterIn,
)

STUDY_ID = "study001"
CHAPTER_ID = "chapter1"
OWNER = "owner"
WRITER = "writer"


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []
        self.closed = False

    async def send_str(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def close(self) -> None:
        self.closed = True


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
            study_mutation_locks={},
            study_mutation_lock_refs={},
            study_socket_users={},
        )
        now = datetime(2026, 9, 4, 16, 0, tzinfo=UTC)
        self.study = Study(
            id=STUDY_ID,
            name="Study",
            owner=OWNER,
            members={OWNER: "write", WRITER: "write"},
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
        self.service = StudyMutationService(cast(Any, self.app_state), allow_stale_revision=True)
        self.user = FakeUser(OWNER)
        self.writer = FakeUser(WRITER)

    async def test_broadcast_study_topics_reaches_the_whole_room(self) -> None:
        first = FakeWebSocket()
        second = FakeWebSocket()
        self.app_state.study_sockets[STUDY_ID] = {first, second}

        await broadcast_study_topics(cast(Any, self.app_state), STUDY_ID, ("King pawn", "Endgame"))

        expected = {
            "type": "study_topics",
            "studyId": STUDY_ID,
            "topics": ["King pawn", "Endgame"],
        }
        self.assertEqual(first.sent, [expected])
        self.assertEqual(second.sent, [expected])

    async def _connect(self, user: FakeUser | None = None) -> FakeWebSocket:
        ws = FakeWebSocket()
        await init_ws(
            cast(Any, self.app_state),
            cast(Any, ws),
            cast(Any, user or self.user),
            STUDY_ID,
        )
        return ws

    async def test_init_reauthorizes_stale_public_handshake_before_room_insertion(self) -> None:
        public_study = replace(self.study, visibility="public")
        await self.db.study.replace_one({"_id": STUDY_ID}, public_study.to_document())
        stale_snapshot = Study.from_document(public_study.to_document())
        outsider = FakeUser("outsider")
        self.assertTrue(can_view_study(stale_snapshot, outsider.username))

        private_study = replace(
            public_study,
            members={OWNER: "write"},
            visibility="private",
            revision=public_study.revision + 1,
        )
        await self.db.study.replace_one({"_id": STUDY_ID}, private_study.to_document())

        ws = FakeWebSocket()
        await init_ws(
            cast(Any, self.app_state),
            cast(Any, ws),
            cast(Any, outsider),
            STUDY_ID,
        )

        self.assertTrue(ws.closed)
        self.assertEqual(ws.sent, [])
        self.assertNotIn(STUDY_ID, self.app_state.study_sockets)
        self.assertNotIn(STUDY_ID, outsider.study_sockets)

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
        self.assertNotIn(STUDY_ID, self.app_state.study_mutation_locks)
        self.assertNotIn(STUDY_ID, self.app_state.study_socket_users)
        self.assertNotIn(STUDY_ID, self.user.study_sockets)
        self.assertFalse(self.user.online)

    async def test_room_cleanup_keeps_lock_used_by_queued_study_operation(self) -> None:
        ws = await self._connect()
        lock = self.app_state.study_mutation_locks[STUDY_ID]
        await lock.acquire()

        entered = asyncio.Event()

        async def queued_operation() -> None:
            async with sequence_study(cast(Any, self.app_state), STUDY_ID):
                entered.set()

        task = asyncio.create_task(queued_operation())
        await asyncio.sleep(0)
        self.assertEqual(self.app_state.study_mutation_lock_refs[STUDY_ID], 1)

        await finally_logic(
            cast(Any, self.app_state), cast(Any, ws), cast(Any, self.user), STUDY_ID
        )
        self.assertIs(self.app_state.study_mutation_locks[STUDY_ID], lock)

        lock.release()
        await task
        self.assertTrue(entered.is_set())
        self.assertNotIn(STUDY_ID, self.app_state.study_mutation_locks)
        self.assertNotIn(STUDY_ID, self.app_state.study_mutation_lock_refs)

    async def test_chapter_sync_reports_sequenced_snapshot_token(self) -> None:
        ws = await self._connect()
        ws.sent.clear()
        chapter_doc = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert chapter_doc is not None
        chapter = StudyChapter.from_document(chapter_doc)
        stale_token = chapter_snapshot_token(chapter)
        # Snapshot verification must cover persisted content that is allowed to
        # change without the collaborative mutation revision (Fishnet analysis is
        # the production example).
        await self.db.study_chapter.update_one(
            {"_id": CHAPTER_ID}, {"$set": {"description": "changed without revision"}}
        )
        current_doc = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert current_doc is not None
        expected = chapter_snapshot_token(StudyChapter.from_document(current_doc))
        self.assertNotEqual(stale_token, expected)

        message = StudySyncChapterIn(
            type="study_sync_chapter",
            studyId=STUDY_ID,
            chapterId=CHAPTER_ID,
            requestId="Sync0001",
        )
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, ws),
            message,
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(
            ws.sent,
            [
                {
                    "type": "study_chapter_sync",
                    "studyId": STUDY_ID,
                    "chapterId": CHAPTER_ID,
                    "requestId": "Sync0001",
                    "revision": 0,
                    "snapshotToken": expected,
                }
            ],
        )

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

    async def test_root_shapes_and_comment_broadcast_canonical_annotations(self) -> None:
        first = await self._connect()
        second = await self._connect()
        first.sent.clear()
        second.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudySetShapesIn(
                type="study_set_shapes",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="shape1",
                expectedRevision=0,
                path="",
                shapes=[{"orig": "e4", "dest": "e5", "brush": "red", "ignored": True}],
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(first.sent, second.sent)
        self.assertEqual(first.sent[0]["type"], "study_set_shapes")
        self.assertEqual(first.sent[0]["revision"], 1)
        self.assertEqual(first.sent[0]["path"], "")
        annotations = cast(dict[str, object], first.sent[0]["annotations"])
        self.assertEqual(
            annotations["shapes"],
            [{"orig": "e4", "dest": "e5", "brush": "red"}],
        )

        first.sent.clear()
        second.sent.clear()
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudySetCommentIn(
                type="study_set_comment",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="comment1",
                expectedRevision=1,
                path="",
                commentId="Comment001",
                text="  Root note  ",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(first.sent, second.sent)
        self.assertEqual(first.sent[0]["revision"], 2)
        annotations = cast(dict[str, object], first.sent[0]["annotations"])
        self.assertEqual(
            annotations["comments"],
            [{"id": "Comment001", "author": OWNER, "text": "Root note"}],
        )

    async def test_description_and_tags_broadcast_server_canonical_values(self) -> None:
        first = await self._connect()
        second = await self._connect()
        first.sent.clear()
        second.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudySetDescriptionIn(
                type="study_set_description",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="description1",
                expectedRevision=0,
                description="  Line one\r\nLine two  ",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        self.assertEqual(first.sent, second.sent)
        self.assertEqual(first.sent[0]["description"], "Line one\nLine two")
        self.assertEqual(first.sent[0]["revision"], 1)

        first.sent.clear()
        second.sent.clear()
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudySetTagsIn(
                type="study_set_tags",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="tags1",
                expectedRevision=1,
                tags={"Site": " PyChess ", "Event": "Test", "Empty": "  "},
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        self.assertEqual(first.sent, second.sent)
        self.assertEqual(first.sent[0]["tags"], {"Event": "Test", "Site": "PyChess"})
        self.assertEqual(first.sent[0]["revision"], 2)

    async def test_stale_annotation_mutation_rebases_and_broadcasts_in_order(self) -> None:
        first = await self._connect()
        second = await self._connect()
        first.sent.clear()
        second.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, first),
            StudySetShapesIn(
                type="study_set_shapes",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="fresh",
                expectedRevision=0,
                path="",
                shapes=[{"orig": "e4", "brush": "blue"}],
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
            StudySetShapesIn(
                type="study_set_shapes",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="stale-shape",
                expectedRevision=0,
                path="",
                shapes=[{"orig": "d4", "brush": "green"}],
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(first.sent, second.sent)
        self.assertEqual(second.sent[0]["type"], "study_set_shapes")
        self.assertEqual(second.sent[0]["revision"], 2)
        annotations = cast(dict[str, object], second.sent[0]["annotations"])
        self.assertEqual(annotations["shapes"], [{"orig": "d4", "brush": "green"}])

    async def test_stale_second_tab_add_rebases_against_latest_tree(self) -> None:
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

        self.assertEqual(first.sent, second.sent)
        self.assertEqual(len(second.sent), 1)
        self.assertEqual(second.sent[0]["type"], "study_add_node")
        self.assertEqual(second.sent[0]["revision"], 2)
        self.assertEqual(second.sent[0]["path"], "Client0002")

    async def test_future_revision_still_requires_reload(self) -> None:
        ws = await self._connect()
        ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, ws),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="future",
                expectedRevision=5,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(ws.sent[0]["type"], "study_reload")
        self.assertEqual(ws.sent[0]["revision"], 0)
        self.assertEqual(ws.sent[0]["reason"], "revision_mismatch")

    async def test_two_contributors_can_add_on_different_branches_concurrently(self) -> None:
        owner_ws = await self._connect(self.user)
        writer_ws = await self._connect(self.writer)
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        for message in (
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="e4",
                expectedRevision=0,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="d4",
                expectedRevision=1,
                parentPath="",
                move="d2d4",
                nodeId="Client0002",
            ),
        ):
            await process_message(
                cast(Any, self.app_state),
                cast(Any, self.user),
                cast(Any, owner_ws),
                message,
                study_id=STUDY_ID,
                service=self.service,
            )
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        await asyncio.gather(
            process_message(
                cast(Any, self.app_state),
                cast(Any, self.user),
                cast(Any, owner_ws),
                StudyAddNodeIn(
                    type="study_add_node",
                    studyId=STUDY_ID,
                    chapterId=CHAPTER_ID,
                    clientOpId="owner-branch",
                    expectedRevision=2,
                    parentPath="Client0001",
                    move="e7e5",
                    nodeId="Client0003",
                ),
                study_id=STUDY_ID,
                service=self.service,
            ),
            process_message(
                cast(Any, self.app_state),
                cast(Any, self.writer),
                cast(Any, writer_ws),
                StudyAddNodeIn(
                    type="study_add_node",
                    studyId=STUDY_ID,
                    chapterId=CHAPTER_ID,
                    clientOpId="writer-branch",
                    expectedRevision=2,
                    parentPath="Client0002",
                    move="d7d5",
                    nodeId="Client0004",
                ),
                study_id=STUDY_ID,
                service=self.service,
            ),
        )

        self.assertEqual([msg["revision"] for msg in owner_ws.sent], [3, 4])
        self.assertEqual(owner_ws.sent, writer_ws.sent)
        chapter = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert chapter is not None
        self.assertEqual(chapter["revision"], 4)
        self.assertIn("Client0003", chapter["root"])
        self.assertIn("Client0004", chapter["root"])

    async def test_concurrent_add_delete_and_promote_are_serialized_without_corruption(
        self,
    ) -> None:
        owner_ws = await self._connect(self.user)
        writer_ws = await self._connect(self.writer)
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, owner_ws),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="e4",
                expectedRevision=0,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, owner_ws),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="d4",
                expectedRevision=1,
                parentPath="",
                move="d2d4",
                nodeId="Client0002",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        # Queue the competing mutations behind an already-held lock. asyncio.Lock is
        # FIFO, so this deterministically exercises add -> promote -> delete while all
        # three clients still submit the same stale expected revision.
        lock = self.app_state.study_mutation_locks[STUDY_ID]
        await lock.acquire()
        tasks = [
            asyncio.create_task(
                process_message(
                    cast(Any, self.app_state),
                    cast(Any, self.user),
                    cast(Any, owner_ws),
                    StudyAddNodeIn(
                        type="study_add_node",
                        studyId=STUDY_ID,
                        chapterId=CHAPTER_ID,
                        clientOpId="add",
                        expectedRevision=2,
                        parentPath="Client0001",
                        move="e7e5",
                        nodeId="Client0003",
                    ),
                    study_id=STUDY_ID,
                    service=self.service,
                )
            ),
            asyncio.create_task(
                process_message(
                    cast(Any, self.app_state),
                    cast(Any, self.writer),
                    cast(Any, writer_ws),
                    StudyPromoteVariationIn(
                        type="study_promote_variation",
                        studyId=STUDY_ID,
                        chapterId=CHAPTER_ID,
                        clientOpId="promote",
                        expectedRevision=2,
                        path="Client0002",
                        toMainline=True,
                    ),
                    study_id=STUDY_ID,
                    service=self.service,
                )
            ),
            asyncio.create_task(
                process_message(
                    cast(Any, self.app_state),
                    cast(Any, self.writer),
                    cast(Any, writer_ws),
                    StudyDeleteNodeIn(
                        type="study_delete_node",
                        studyId=STUDY_ID,
                        chapterId=CHAPTER_ID,
                        clientOpId="delete",
                        expectedRevision=2,
                        path="Client0001",
                    ),
                    study_id=STUDY_ID,
                    service=self.service,
                )
            ),
        ]
        await asyncio.sleep(0)
        lock.release()
        await asyncio.gather(*tasks)

        chapter = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert chapter is not None
        self.assertEqual(chapter["revision"], 5)
        self.assertNotIn("Client0001", chapter["root"])
        self.assertNotIn("Client0003", chapter["root"])
        self.assertEqual(chapter["root"]["Client0002"].get("o", 0), 0)
        self.assertEqual([msg["revision"] for msg in owner_ws.sent], [3, 4, 5])
        self.assertEqual(owner_ws.sent, writer_ws.sent)

    async def test_writer_shared_position_is_broadcast_without_chapter_revision(self) -> None:
        owner_ws = await self._connect(self.user)
        writer_ws = await self._connect(self.writer)
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, owner_ws),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="position-node",
                expectedRevision=0,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.writer),
            cast(Any, writer_ws),
            StudySetPositionIn(
                type="study_set_position",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                path="Client0001",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(owner_ws.sent, writer_ws.sent)
        self.assertEqual(
            owner_ws.sent,
            [
                {
                    "type": "study_position",
                    "studyId": STUDY_ID,
                    "chapterId": CHAPTER_ID,
                    "path": "Client0001",
                }
            ],
        )
        stored_study = await self.db.study.find_one({"_id": STUDY_ID})
        assert stored_study is not None
        self.assertEqual(stored_study["currentChapter"], CHAPTER_ID)
        self.assertEqual(stored_study["currentPath"], "Client0001")
        stored_chapter = await self.db.study_chapter.find_one({"_id": CHAPTER_ID})
        assert stored_chapter is not None
        self.assertEqual(stored_chapter["revision"], 1)

    async def test_read_member_cannot_change_shared_position(self) -> None:
        owner_ws = await self._connect(self.user)
        reader = FakeUser("reader")
        reader_ws = await self._connect(reader)
        await self.db.study.update_one(
            {"_id": STUDY_ID},
            {"$set": {"members.reader": "read"}},
        )
        owner_ws.sent.clear()
        reader_ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, reader),
            cast(Any, reader_ws),
            StudySetPositionIn(
                type="study_set_position",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                path="",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(owner_ws.sent, [])
        self.assertEqual(reader_ws.sent[0]["type"], "study_reload")
        self.assertEqual(reader_ws.sent[0]["reason"], "invalid_shared_position")
        stored_study = await self.db.study.find_one({"_id": STUDY_ID})
        assert stored_study is not None
        self.assertNotIn("currentPath", stored_study)

    async def test_deleting_shared_subtree_repairs_and_broadcasts_position(self) -> None:
        owner_ws = await self._connect(self.user)
        writer_ws = await self._connect(self.writer)
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        for message in (
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="repair-e4",
                expectedRevision=0,
                parentPath="",
                move="e2e4",
                nodeId="Client0001",
            ),
            StudyAddNodeIn(
                type="study_add_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="repair-e5",
                expectedRevision=1,
                parentPath="Client0001",
                move="e7e5",
                nodeId="Client0002",
            ),
        ):
            await process_message(
                cast(Any, self.app_state),
                cast(Any, self.user),
                cast(Any, owner_ws),
                message,
                study_id=STUDY_ID,
                service=self.service,
            )
        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.user),
            cast(Any, owner_ws),
            StudySetPositionIn(
                type="study_set_position",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                path="Client0001.Client0002",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        await process_message(
            cast(Any, self.app_state),
            cast(Any, self.writer),
            cast(Any, writer_ws),
            StudyDeleteNodeIn(
                type="study_delete_node",
                studyId=STUDY_ID,
                chapterId=CHAPTER_ID,
                clientOpId="repair-delete",
                expectedRevision=2,
                path="Client0001.Client0002",
            ),
            study_id=STUDY_ID,
            service=self.service,
        )

        self.assertEqual(owner_ws.sent, writer_ws.sent)
        self.assertEqual(
            [message["type"] for message in owner_ws.sent], ["study_delete_node", "study_position"]
        )
        self.assertEqual(owner_ws.sent[1]["path"], "Client0001")
        stored_study = await self.db.study.find_one({"_id": STUDY_ID})
        assert stored_study is not None
        self.assertEqual(stored_study["currentPath"], "Client0001")

    async def test_membership_broadcast_updates_room_and_revokes_private_access(self) -> None:
        owner_ws = await self._connect(self.user)
        writer_ws = await self._connect(self.writer)
        owner_ws.sent.clear()
        writer_ws.sent.clear()

        updated = replace(
            self.study,
            members={OWNER: "write"},
            revision=self.study.revision + 1,
        )
        await broadcast_study_members(cast(Any, self.app_state), updated)

        self.assertEqual(owner_ws.sent, writer_ws.sent)
        self.assertEqual(
            owner_ws.sent,
            [
                {
                    "type": "study_members",
                    "studyId": STUDY_ID,
                    "members": {OWNER: "write"},
                    "revision": 1,
                }
            ],
        )
        self.assertFalse(owner_ws.closed)
        self.assertTrue(writer_ws.closed)

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
