import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from yarl import URL

from catalogued_variants import (
    CATALOGUED_FSF_BUILTIN_AUTHOR,
    CATALOGUED_SOURCE_FSF_BUILTIN,
    MAX_CATALOGUED_VARIANTS_PER_USER,
    _positive_management_page,
    get_my_catalogued_variants,
)


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)
        self.skip_count = 0
        self.limit_count = len(self.docs)
        self.sort_spec = []

    def sort(self, spec):
        self.sort_spec = list(spec)
        for field, direction in reversed(self.sort_spec):
            self.docs.sort(key=lambda doc: doc.get(field), reverse=direction < 0)
        return self

    def skip(self, count):
        self.skip_count = count
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def __aiter__(self):
        selected = self.docs[self.skip_count : self.skip_count + self.limit_count]

        async def iterate():
            for doc in selected:
                yield doc

        return iterate()


class FakeCollection:
    def __init__(self, docs):
        self.docs = list(docs)
        self.count_queries = []
        self.find_queries = []
        self.cursor = None

    @staticmethod
    def _matches(doc, query):
        return all(doc.get(field) == value for field, value in query.items())

    async def count_documents(self, query):
        self.count_queries.append(query)
        return sum(1 for doc in self.docs if self._matches(doc, query))

    def find(self, query):
        self.find_queries.append(query)
        self.cursor = FakeCursor(doc for doc in self.docs if self._matches(doc, query))
        return self.cursor


class FakeDatabase:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, _name):
        return self.collection


class CataloguedVariantManagementPaginationTestCase(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def make_docs(count, *, author="owner", source="user"):
        return [
            {
                "name": f"variant{i:02d}",
                "author": author,
                "source": source,
                "updatedAt": i,
            }
            for i in range(count)
        ]

    async def call_handler(self, url, docs, *, username="admin", admin=True):
        collection = FakeCollection(docs)
        app_state = SimpleNamespace(db=FakeDatabase(collection))
        request = SimpleNamespace(app=object(), rel_url=URL(url))

        with (
            patch("catalogued_variants.get_app_state", return_value=app_state),
            patch(
                "catalogued_variants._current_human_username",
                new=AsyncMock(return_value=username),
            ),
            patch("catalogued_variants._is_admin_username", return_value=admin),
            patch("catalogued_variants._game_count", new=AsyncMock(return_value=7)),
            patch(
                "catalogued_variants._client_doc",
                side_effect=lambda doc, game_count: {
                    "name": doc["name"],
                    "gameCount": game_count,
                },
            ),
        ):
            response = await get_my_catalogued_variants(request)

        return json.loads(response.text), collection

    def test_positive_page_normalizes_invalid_values(self):
        self.assertEqual(_positive_management_page(None), 1)
        self.assertEqual(_positive_management_page("invalid"), 1)
        self.assertEqual(_positive_management_page("-5"), 1)
        self.assertEqual(_positive_management_page("3"), 3)

    async def test_admin_all_scope_returns_requested_page(self):
        payload, collection = await self.call_handler(
            "/api/catalogued-variants/mine?scope=all&page=2",
            self.make_docs(45),
        )

        self.assertEqual(payload["total"], 45)
        self.assertEqual(payload["page"], 2)
        self.assertEqual(payload["pages"], 3)
        self.assertEqual(payload["prevPage"], 1)
        self.assertEqual(payload["nextPage"], 3)
        self.assertIsNone(payload["maxVariants"])
        self.assertEqual(
            [variant["name"] for variant in payload["variants"]],
            [f"variant{i:02d}" for i in range(24, 4, -1)],
        )
        self.assertEqual(collection.count_queries, [{}])
        self.assertEqual(collection.find_queries, [{}])
        self.assertEqual(collection.cursor.sort_spec, [("updatedAt", -1), ("name", 1)])
        self.assertEqual(collection.cursor.skip_count, 20)
        self.assertEqual(collection.cursor.limit_count, 20)

    async def test_page_beyond_end_is_clamped_to_last_page(self):
        payload, _collection = await self.call_handler(
            "/api/catalogued-variants/mine?scope=all&page=99",
            self.make_docs(45),
        )

        self.assertEqual(payload["page"], 3)
        self.assertEqual(payload["prevPage"], 2)
        self.assertIsNone(payload["nextPage"])
        self.assertEqual(
            [variant["name"] for variant in payload["variants"]],
            [f"variant{i:02d}" for i in range(4, -1, -1)],
        )

    async def test_fsf_scope_filters_before_pagination(self):
        fsf_docs = self.make_docs(
            21,
            author=CATALOGUED_FSF_BUILTIN_AUTHOR,
            source=CATALOGUED_SOURCE_FSF_BUILTIN,
        )
        payload, collection = await self.call_handler(
            "/api/catalogued-variants/mine?scope=fsf&page=2",
            [*self.make_docs(10), *fsf_docs],
        )

        expected_query = {"source": CATALOGUED_SOURCE_FSF_BUILTIN}
        self.assertEqual(collection.count_queries, [expected_query])
        self.assertEqual(collection.find_queries, [expected_query])
        self.assertEqual(payload["total"], 21)
        self.assertEqual(payload["page"], 2)
        self.assertEqual(payload["pages"], 2)
        self.assertEqual(len(payload["variants"]), 1)

    async def test_non_admin_cannot_expand_scope_and_total_drives_quota_counter(self):
        docs = [
            *self.make_docs(3, author="alice"),
            *self.make_docs(4, author="other"),
        ]
        payload, collection = await self.call_handler(
            "/api/catalogued-variants/mine?scope=all",
            docs,
            username="alice",
            admin=False,
        )

        expected_query = {"author": "alice"}
        self.assertEqual(collection.count_queries, [expected_query])
        self.assertEqual(collection.find_queries, [expected_query])
        self.assertEqual(payload["total"], 3)
        self.assertEqual(payload["maxVariants"], MAX_CATALOGUED_VARIANTS_PER_USER)
        self.assertEqual(len(payload["variants"]), 3)
