from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass
from time import monotonic
from typing import Any

from pymongo import AsyncMongoClient

from settings import MONGO_DB_NAME, MONGO_HOST


INDEX_SPECS = (
    ("us_d_desc", [("us", 1), ("d", -1)]),
    ("us0_d_desc", [("us.0", 1), ("d", -1)]),
    ("us1_d_desc", [("us.1", 1), ("d", -1)]),
    ("us0_us1_d_desc", [("us.0", 1), ("us.1", 1), ("d", -1)]),
)


@dataclass
class IndexResult:
    name: str
    key: list[tuple[str, int]]
    action: str
    details: str
    duration_ms: float


def _pattern_from_doc(index_doc: dict[str, Any]) -> tuple[tuple[str, int], ...]:
    # Mongo returns key as an ordered mapping.
    key_doc = index_doc.get("key", {})
    return tuple((str(k), int(v)) for k, v in key_doc.items())


async def _load_existing_indexes(collection: Any) -> list[dict[str, Any]]:
    cursor = await collection.list_indexes()
    docs: list[dict[str, Any]] = []
    async for index_doc in cursor:
        docs.append(index_doc)
    return docs


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Create profile-related compound indexes on game collection. "
            "Run with PYTHONPATH=server."
        )
    )
    parser.add_argument(
        "--mongo-host",
        default=MONGO_HOST,
        help="Mongo connection URI (defaults to settings.MONGO_HOST)",
    )
    parser.add_argument(
        "--mongo-db",
        default=MONGO_DB_NAME,
        help="Mongo database name (defaults to settings.MONGO_DB_NAME)",
    )
    parser.add_argument(
        "--drop-conflicting-names",
        action="store_true",
        help=(
            "If an index with the target name exists but with different key pattern, "
            "drop and recreate it."
        ),
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Optional path to write summary JSON",
    )
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]
    collection = db.game

    results: list[IndexResult] = []
    started_all = monotonic()

    try:
        existing = await _load_existing_indexes(collection)
        by_name = {doc.get("name"): doc for doc in existing if "name" in doc}
        by_pattern: dict[tuple[tuple[str, int], ...], str] = {}
        for doc in existing:
            name = doc.get("name")
            if not isinstance(name, str):
                continue
            by_pattern[_pattern_from_doc(doc)] = name

        total = len(INDEX_SPECS)
        for idx_num, (name, key) in enumerate(INDEX_SPECS, start=1):
            start = monotonic()
            pattern = tuple(key)
            print(f"[{idx_num}/{total}] ensuring index '{name}' with key {key} ...", flush=True)

            existing_named = by_name.get(name)
            if existing_named is not None:
                existing_pattern = _pattern_from_doc(existing_named)
                if existing_pattern == pattern:
                    results.append(
                        IndexResult(
                            name=name,
                            key=key,
                            action="already_exists",
                            details="matching name and key pattern already present",
                            duration_ms=(monotonic() - start) * 1000.0,
                        )
                    )
                    print(f"[{idx_num}/{total}] {name}: already exists", flush=True)
                    continue

                if not args.drop_conflicting_names:
                    results.append(
                        IndexResult(
                            name=name,
                            key=key,
                            action="conflict",
                            details=(
                                "index name exists with different key pattern; "
                                "rerun with --drop-conflicting-names to replace it"
                            ),
                            duration_ms=(monotonic() - start) * 1000.0,
                        )
                    )
                    print(
                        f"[{idx_num}/{total}] {name}: conflict (rerun with --drop-conflicting-names)",
                        flush=True,
                    )
                    continue

                await collection.drop_index(name)
                created_name = await collection.create_index(key, name=name)
                results.append(
                    IndexResult(
                        name=name,
                        key=key,
                        action="recreated",
                        details=f"dropped conflicting index and created {created_name}",
                        duration_ms=(monotonic() - start) * 1000.0,
                    )
                )
                print(f"[{idx_num}/{total}] {name}: recreated as {created_name}", flush=True)
                # Refresh name->doc/pattern map after mutation.
                existing = await _load_existing_indexes(collection)
                by_name = {doc.get("name"): doc for doc in existing if "name" in doc}
                by_pattern = {}
                for doc in existing:
                    doc_name = doc.get("name")
                    if isinstance(doc_name, str):
                        by_pattern[_pattern_from_doc(doc)] = doc_name
                continue

            existing_pattern_name = by_pattern.get(pattern)
            if existing_pattern_name is not None:
                results.append(
                    IndexResult(
                        name=name,
                        key=key,
                        action="already_exists_different_name",
                        details=(
                            f"matching key pattern already exists as '{existing_pattern_name}', "
                            "left unchanged"
                        ),
                        duration_ms=(monotonic() - start) * 1000.0,
                    )
                )
                print(
                    f"[{idx_num}/{total}] {name}: key already present as {existing_pattern_name}",
                    flush=True,
                )
                continue

            created_name = await collection.create_index(key, name=name)
            results.append(
                IndexResult(
                    name=name,
                    key=key,
                    action="created",
                    details=f"created index {created_name}",
                    duration_ms=(monotonic() - start) * 1000.0,
                )
            )
            by_pattern[pattern] = created_name
            print(f"[{idx_num}/{total}] {name}: created as {created_name}", flush=True)

        elapsed_ms = (monotonic() - started_all) * 1000.0
        print(f"Processed {len(INDEX_SPECS)} target indexes in {elapsed_ms:.1f}ms")
        for result in results:
            print(
                json.dumps(
                    asdict(result),
                    ensure_ascii=True,
                    sort_keys=True,
                    default=str,
                )
            )

        if args.json_out:
            payload = {
                "mongo_db": args.mongo_db,
                "results": [asdict(r) for r in results],
                "elapsed_ms": elapsed_ms,
            }
            with open(args.json_out, "w", encoding="utf-8") as fp:
                json.dump(payload, fp, ensure_ascii=True, sort_keys=True, indent=2)
            print(f"Wrote JSON summary to {args.json_out}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
