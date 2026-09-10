from __future__ import annotations

import asyncio
import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

from fairy import FairyBoard
from mongomock_motor import AsyncMongoMockClient
from study.annotations import StudyAnnotations, StudyComment
from study.gdpr import STUDY_ERASED_USER, erase_user_from_studies
from study.models import Study, StudyChapter
from study.sequencer import sequence_study
from study.tree import StudyTree


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []
        self.closed = False

    async def send_str(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def close(self) -> None:
        self.closed = True


class StudyGdprTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = AsyncMongoMockClient(tz_aware=True)
        self.db = self.client["pychess-test"]
        self.app_state = SimpleNamespace(
            db=self.db,
            study_sockets={},
            study_socket_users={},
            study_mutation_locks={},
            study_mutation_lock_refs={},
            fishnet_works={},
        )
        self.now = datetime(2026, 9, 10, 0, 0, tzinfo=UTC)

    async def _insert_study(
        self,
        study_id: str,
        *,
        owner: str,
        visibility: str,
        members: dict[str, str] | None = None,
        likers: tuple[str, ...] = (),
        comments: tuple[StudyComment, ...] = (),
    ) -> tuple[Study, StudyChapter]:
        chapter_id = f"{study_id}c"
        roles = members or {owner: "write"}
        study = Study(
            id=study_id,
            name=f"{study_id} study",
            owner=owner,
            members=cast(Any, roles),
            visibility=cast(Any, visibility),
            current_chapter=chapter_id,
            created_at=self.now,
            updated_at=self.now,
            likers=likers,
        )
        chapter = StudyChapter(
            id=chapter_id,
            study_id=study_id,
            name="Chapter 1",
            order=1,
            owner=owner,
            variant="chess",
            initial_fen=FairyBoard.start_fen("chess"),
            orientation="white",
            root=StudyTree(root_annotations=StudyAnnotations(comments=comments)),
            created_at=self.now,
            updated_at=self.now,
        )
        await self.db.study.insert_one(study.to_document())
        await self.db.study_chapter.insert_one(chapter.to_document())
        return study, chapter

    async def test_account_erasure_deletes_nonpublic_owned_studies(self) -> None:
        private, private_chapter = await self._insert_study(
            "private1",
            owner="alice",
            visibility="private",
            members={"alice": "write", "bob": "read"},
            likers=("alice", "bob"),
        )
        unlisted, unlisted_chapter = await self._insert_study(
            "unlist01",
            owner="alice",
            visibility="unlisted",
            members={"alice": "write", "bob": "write"},
            likers=("alice",),
        )
        private_ws = FakeWebSocket()
        unlisted_ws = FakeWebSocket()
        self.app_state.study_sockets[private.id] = {private_ws}
        self.app_state.study_sockets[unlisted.id] = {unlisted_ws}
        self.app_state.study_socket_users[private.id] = {private_ws: "bob"}
        self.app_state.study_socket_users[unlisted.id] = {unlisted_ws: "bob"}

        await erase_user_from_studies(cast(Any, self.app_state), "alice")

        self.assertIsNone(await self.db.study.find_one({"_id": private.id}))
        self.assertIsNone(await self.db.study.find_one({"_id": unlisted.id}))
        self.assertIsNone(await self.db.study_chapter.find_one({"_id": private_chapter.id}))
        self.assertIsNone(await self.db.study_chapter.find_one({"_id": unlisted_chapter.id}))
        self.assertTrue(private_ws.closed)
        self.assertTrue(unlisted_ws.closed)

    async def test_account_erasure_anonymizes_public_owner_members_likes_and_comments(self) -> None:
        alice_comment = StudyComment("Comment001", "alice", "Alice note")
        bob_comment = StudyComment("Comment002", "bob", "Bob note")
        study, chapter = await self._insert_study(
            "public01",
            owner="alice",
            visibility="public",
            members={"alice": "write", "bob": "write", "carol": "read"},
            likers=("alice", "bob"),
            comments=(alice_comment, bob_comment),
        )
        owner_ws = FakeWebSocket()
        collaborator_ws = FakeWebSocket()
        self.app_state.study_sockets[study.id] = {owner_ws, collaborator_ws}
        self.app_state.study_socket_users[study.id] = {
            owner_ws: "alice",
            collaborator_ws: "bob",
        }

        await erase_user_from_studies(cast(Any, self.app_state), "alice")

        study_doc = await self.db.study.find_one({"_id": study.id})
        self.assertIsNotNone(study_doc)
        assert study_doc is not None
        self.assertEqual(STUDY_ERASED_USER, study_doc["owner"])
        self.assertEqual(
            {STUDY_ERASED_USER: "write", "bob": "write", "carol": "read"},
            study_doc["members"],
        )
        self.assertEqual([STUDY_ERASED_USER, "bob", "carol"], study_doc["memberIds"])
        self.assertEqual([STUDY_ERASED_USER, "bob"], study_doc["writeMembers"])
        self.assertEqual(["bob"], study_doc["likers"])
        self.assertEqual(1, study_doc["likes"])
        self.assertNotIn("alice", study_doc["searchTokens"])

        chapter_doc = await self.db.study_chapter.find_one({"_id": chapter.id})
        self.assertIsNotNone(chapter_doc)
        assert chapter_doc is not None
        self.assertEqual(STUDY_ERASED_USER, chapter_doc["owner"])
        comments = chapter_doc["root"]["_"]["a"]["c"]
        self.assertEqual(STUDY_ERASED_USER, comments[0]["a"])
        self.assertEqual("bob", comments[1]["a"])
        self.assertEqual(1, chapter_doc["revision"])
        self.assertEqual(self.now, chapter_doc["updatedAt"])

        self.assertTrue(owner_ws.closed)
        self.assertFalse(collaborator_ws.closed)
        self.assertTrue(
            any(message.get("type") == "study_reload" for message in collaborator_ws.sent)
        )

    async def test_account_erasure_removes_former_member_and_anonymizes_old_comments(self) -> None:
        alice_comment = StudyComment("Comment001", "alice", "Old contributor note")
        study, chapter = await self._insert_study(
            "other001",
            owner="bob",
            visibility="private",
            members={"bob": "write", "alice": "write", "carol": "read"},
            likers=("bob", "alice"),
            comments=(alice_comment,),
        )
        alice_ws = FakeWebSocket()
        carol_ws = FakeWebSocket()
        self.app_state.study_sockets[study.id] = {alice_ws, carol_ws}
        self.app_state.study_socket_users[study.id] = {
            alice_ws: "alice",
            carol_ws: "carol",
        }

        await erase_user_from_studies(cast(Any, self.app_state), "alice")

        study_doc = await self.db.study.find_one({"_id": study.id})
        self.assertIsNotNone(study_doc)
        assert study_doc is not None
        self.assertEqual("bob", study_doc["owner"])
        self.assertEqual({"bob": "write", "carol": "read"}, study_doc["members"])
        self.assertEqual(["bob", "carol"], study_doc["memberIds"])
        self.assertEqual(["bob"], study_doc["writeMembers"])
        self.assertEqual(["bob"], study_doc["likers"])
        self.assertEqual(1, study_doc["likes"])

        chapter_doc = await self.db.study_chapter.find_one({"_id": chapter.id})
        self.assertIsNotNone(chapter_doc)
        assert chapter_doc is not None
        comments = chapter_doc["root"]["_"]["a"]["c"]
        self.assertEqual(STUDY_ERASED_USER, comments[0]["a"])
        self.assertTrue(alice_ws.closed)
        self.assertFalse(carol_ws.closed)
        self.assertTrue(any(message.get("reason") == "account_erased" for message in carol_ws.sent))

    async def test_account_erasure_rechecks_comment_authorship_under_study_lock(self) -> None:
        study, chapter = await self._insert_study(
            "race0001",
            owner="bob",
            visibility="private",
            members={"bob": "write", "alice": "write"},
        )

        async with sequence_study(cast(Any, self.app_state), study.id):
            erase_task = asyncio.create_task(
                erase_user_from_studies(cast(Any, self.app_state), "alice")
            )
            for _ in range(100):
                if self.app_state.study_mutation_lock_refs.get(study.id, 0) >= 2:
                    break
                await asyncio.sleep(0)
            self.assertGreaterEqual(
                self.app_state.study_mutation_lock_refs.get(study.id, 0),
                2,
                "erasure did not reach the sequenced Study after preliminary discovery",
            )

            # The unlocked discovery scan has already completed with no Alice
            # comment. Model a mutation that committed ahead of erasure acquiring
            # this Study's sequencer. The locked erasure pass must discover it.
            root = StudyTree(
                root_annotations=StudyAnnotations(
                    comments=(StudyComment("Comment001", "alice", "Late note"),)
                )
            )
            await self.db.study_chapter.update_one(
                {"_id": chapter.id, "studyId": study.id},
                {"$set": {"root": root.to_document()}, "$inc": {"revision": 1}},
            )

        await erase_task

        chapter_doc = await self.db.study_chapter.find_one({"_id": chapter.id})
        self.assertIsNotNone(chapter_doc)
        assert chapter_doc is not None
        comments = chapter_doc["root"]["_"]["a"]["c"]
        self.assertEqual(STUDY_ERASED_USER, comments[0]["a"])
        self.assertEqual(2, chapter_doc["revision"])

        study_doc = await self.db.study.find_one({"_id": study.id})
        self.assertIsNotNone(study_doc)
        assert study_doc is not None
        self.assertNotIn("alice", study_doc["members"])

    async def test_account_erasure_finds_comments_after_membership_was_already_removed(
        self,
    ) -> None:
        alice_comment = StudyComment("Comment001", "alice", "Historical note")
        study, chapter = await self._insert_study(
            "former01",
            owner="bob",
            visibility="public",
            members={"bob": "write"},
            likers=("bob",),
            comments=(alice_comment,),
        )

        await erase_user_from_studies(cast(Any, self.app_state), "alice")

        chapter_doc = await self.db.study_chapter.find_one({"_id": chapter.id})
        self.assertIsNotNone(chapter_doc)
        assert chapter_doc is not None
        comments = chapter_doc["root"]["_"]["a"]["c"]
        self.assertEqual(STUDY_ERASED_USER, comments[0]["a"])
        study_doc = await self.db.study.find_one({"_id": study.id})
        self.assertEqual(1, study_doc["revision"])
