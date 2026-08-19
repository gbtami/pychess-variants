from __future__ import annotations

import argparse
import asyncio
from time import monotonic
from typing import Any

from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

INDEX_NAME = "sid_1"
INDEX_KEY = (("sid", 1),)


def _index_key(index_doc: dict[str, Any]) -> tuple[tuple[str, int], ...]:
    key_doc = index_doc.get("key", {})
    return tuple((str(field), int(direction)) for field, direction in key_doc.items())


async def _load_indexes(collection: Any) -> list[dict[str, Any]]:
    cursor = await collection.list_indexes()
    indexes: list[dict[str, Any]] = []
    async for index_doc in cursor:
        indexes.append(index_doc)
    return indexes


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Create the sparse game.sid index used to restore started simuls efficiently. "
            "Run before deploying simul support to a populated database, with PYTHONPATH=server."
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
        "--dry-run",
        action="store_true",
        help="Inspect the current indexes without creating anything.",
    )
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    collection = client[args.mongo_db].game

    try:
        indexes = await _load_indexes(collection)
        by_name = {doc.get("name"): doc for doc in indexes if isinstance(doc.get("name"), str)}
        matching_key = next((doc for doc in indexes if _index_key(doc) == INDEX_KEY), None)

        if matching_key is not None:
            existing_name = str(matching_key.get("name", "<unnamed>"))
            if matching_key.get("sparse") is True:
                print(f"Sparse game.sid index already exists as '{existing_name}'; nothing to do.")
                return

            raise SystemExit(
                f"Refusing to continue: game.sid is already indexed as '{existing_name}', "
                "but that index is not sparse. Inspect it manually before changing it."
            )

        named_index = by_name.get(INDEX_NAME)
        if named_index is not None:
            raise SystemExit(
                f"Refusing to continue: index name '{INDEX_NAME}' already exists with key "
                f"{_index_key(named_index)}. Inspect it manually before changing it."
            )

        if args.dry_run:
            print(f"Would create sparse index '{INDEX_NAME}' on {args.mongo_db}.game: {{'sid': 1}}")
            return

        print(
            f"Creating sparse index '{INDEX_NAME}' on {args.mongo_db}.game {{'sid': 1}}.\n"
            "MongoDB must inspect the existing game collection while building this index; "
            "wait for this command to finish before deploying/restarting the server.",
            flush=True,
        )
        started = monotonic()
        created_name = await collection.create_index("sid", name=INDEX_NAME, sparse=True)
        elapsed = monotonic() - started
        print(f"Created index '{created_name}' in {elapsed:.1f} seconds.")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
