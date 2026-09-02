from __future__ import annotations

import argparse
import asyncio
from collections.abc import Mapping
from typing import Any

from pymongo import AsyncMongoClient, UpdateOne
from settings import MONGO_DB_NAME, MONGO_HOST


async def _favorite_counts(user_collection: Any) -> dict[str, int]:
    """Count each user's favorite at most once, even if legacy data contains duplicates."""

    cursor = await user_collection.aggregate(
        [
            {"$match": {"cvf": {"$type": "array"}}},
            {"$unwind": "$cvf"},
            {"$match": {"cvf": {"$type": "string", "$ne": ""}}},
            {"$group": {"_id": {"user": "$_id", "variant": "$cvf"}}},
            {"$group": {"_id": "$_id.variant", "count": {"$sum": 1}}},
        ]
    )
    counts: dict[str, int] = {}
    async for row in cursor:
        name = row.get("_id")
        count = row.get("count")
        if isinstance(name, str) and isinstance(count, int) and count > 0:
            counts[name] = count
    return counts


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Rebuild catalogued_variant.favoriteCount from users' cvf arrays. "
            "Dry-run by default. Run with PYTHONPATH=server."
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
        "--apply",
        action="store_true",
        help=(
            "Write rebuilt counts and remove cvf entries that no longer name a catalogued variant. "
            "Without this flag the script is dry-run."
        ),
    )
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]
    variants = db.catalogued_variant
    users = db.user

    try:
        variant_docs = await variants.find({}, projection={"_id": 1, "favoriteCount": 1}).to_list(
            length=None
        )
        valid_names = {
            str(doc["_id"])
            for doc in variant_docs
            if isinstance(doc, Mapping) and isinstance(doc.get("_id"), str)
        }
        counts = await _favorite_counts(users)
        valid_counts = {name: count for name, count in counts.items() if name in valid_names}
        stale_counts = {name: count for name, count in counts.items() if name not in valid_names}

        stored_total = sum(max(0, int(doc.get("favoriteCount") or 0)) for doc in variant_docs)
        rebuilt_total = sum(valid_counts.values())

        print(f"Mode: {'apply' if args.apply else 'dry-run'}")
        print(f"Catalogued variants: {len(valid_names)}")
        print(f"Stored favorite total: {stored_total}")
        print(f"Rebuilt favorite total: {rebuilt_total}")
        print(f"Variants with favorites: {len(valid_counts)}")
        print(
            f"Stale favorite names: {len(stale_counts)} "
            f"({sum(stale_counts.values())} user entries)"
        )

        if valid_counts:
            print("Top favorites:")
            for name, count in sorted(
                valid_counts.items(), key=lambda item: (-item[1], item[0])
            )[:20]:
                print(f"  {count:5d}  {name}")

        if stale_counts:
            print("Stale favorites that reference no current catalogued variant:")
            for name, count in sorted(
                stale_counts.items(), key=lambda item: (-item[1], item[0])
            )[:20]:
                print(f"  {count:5d}  {name}")

        if not args.apply:
            print(
                "No changes written. Run with --apply while favorite writes are quiesced "
                "(for example during maintenance/deployment)."
            )
            return

        if not valid_names:
            parser.error("Refusing --apply because the catalogued_variant collection is empty.")

        await variants.update_many({}, {"$set": {"favoriteCount": 0}})
        operations = [
            UpdateOne({"_id": name}, {"$set": {"favoriteCount": count}})
            for name, count in valid_counts.items()
        ]
        if operations:
            await variants.bulk_write(operations, ordered=False)

        stale_cleanup = await users.update_many(
            {"cvf": {"$exists": True}},
            {"$pull": {"cvf": {"$nin": sorted(valid_names)}}},
        )
        print(
            f"Rebuilt favoriteCount on {len(valid_names)} variants; "
            f"cleaned stale favorites from {stale_cleanup.modified_count} user documents."
        )
        print(
            "Restart the server after this script so cached catalogue documents use rebuilt counts."
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
