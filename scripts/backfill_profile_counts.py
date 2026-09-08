"""Backfill or repair stored profile counters; dry-run unless --apply is supplied.

    PYTHONPATH=server uv run python scripts/backfill_profile_counts.py
    PYTHONPATH=server uv run python scripts/backfill_profile_counts.py --apply

Run after deploying the counter update hooks, then restart the server to reload
cached users. The same optimistic update protocol as the server prevents backfill
from overwriting concurrent counter refreshes.
Use --after USERNAME to resume a stopped run, or --user USERNAME for one account.
"""

from __future__ import annotations

import argparse
import asyncio

from profile_counts import calculate_counter, refresh_counter
from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--user")
    parser.add_argument("--after")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--mongo-host", default=MONGO_HOST)
    parser.add_argument("--db", default=MONGO_DB_NAME)
    args = parser.parse_args()
    query = {"_id": args.user} if args.user else {"_id": {"$gt": args.after or ""}}
    client = AsyncMongoClient(args.mongo_host)
    try:
        db = client[args.db]
        processed = 0
        async for user in db.user.find(query, {"_id": 1}).sort("_id", 1):
            username = user["_id"]
            values = {}
            for counter in ("forumPosts", "tournamentPoints"):
                if args.apply:
                    doc = await refresh_counter(db, username, counter)
                    values[counter] = doc[counter] if doc else None
                else:
                    values[counter] = await calculate_counter(db, username, counter)
            processed += 1
            print(f"{username}: {values}", flush=True)
            if args.limit > 0 and processed >= args.limit:
                break
        print(f"{'Updated' if args.apply else 'Dry-run'}: {processed} users")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
