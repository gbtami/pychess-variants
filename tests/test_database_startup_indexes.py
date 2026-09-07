from __future__ import annotations

import unittest

from database.schema import INDEXES, OBSOLETE_INDEXES
from database.startup import drop_obsolete_indexes, ensure_indexes
from mongomock_motor import AsyncMongoMockClient


class ObsoleteIndexCleanupTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_old_public_study_search_index_is_replaced_by_full_index(self) -> None:
        db = AsyncMongoMockClient().test
        await db.create_collection("study")
        await db.study.create_index(
            [("searchTokens", 1), ("updatedAt", -1), ("_id", 1)],
            name="public_searchTokens_updatedAt",
            partialFilterExpression={"visibility": "public"},
        )
        current = next(
            spec
            for spec in INDEXES
            if spec.collection == "study" and spec.name == "searchTokens_updatedAt"
        )

        dropped = await drop_obsolete_indexes(db, OBSOLETE_INDEXES)
        created = await ensure_indexes(db, (current,))

        self.assertEqual(dropped, ("study.public_searchTokens_updatedAt",))
        self.assertEqual([result.created_name for result in created], ["searchTokens_updatedAt"])
        indexes = await db.study.index_information()
        self.assertNotIn("public_searchTokens_updatedAt", indexes)
        self.assertNotIn("partialFilterExpression", indexes["searchTokens_updatedAt"])

    async def test_unexpected_definition_is_not_dropped(self) -> None:
        db = AsyncMongoMockClient().test
        await db.create_collection("study")
        await db.study.create_index(
            [("searchTokens", 1), ("updatedAt", -1), ("_id", 1)],
            name="public_searchTokens_updatedAt",
            partialFilterExpression={"visibility": "private"},
        )

        dropped = await drop_obsolete_indexes(db, OBSOLETE_INDEXES)

        self.assertEqual(dropped, ())
        indexes = await db.study.index_information()
        self.assertIn("public_searchTokens_updatedAt", indexes)


if __name__ == "__main__":
    unittest.main()
