from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from time import monotonic
from typing import Any

from pymongo import AsyncMongoClient, UpdateOne

from settings import MONGO_DB_NAME, MONGO_HOST


USER_CREATED_AT_MISSING = {
    "$or": [
        {"createdAt": {"$exists": False}},
        {"createdAt": None},
    ]
}
US_D_DESC_KEY = [("us", 1), ("d", -1)]
US_D_DESC_PATTERN = tuple(US_D_DESC_KEY)


@dataclass
class BackfillStats:
    scanned_users: int = 0
    matched_games: int = 0
    no_games: int = 0
    update_ops: int = 0
    modified_docs: int = 0
    batches_flushed: int = 0


def _index_pattern(index_doc: dict[str, Any]) -> tuple[tuple[str, int], ...]:
    key_doc = index_doc.get("key", {})
    return tuple((str(k), int(v)) for k, v in key_doc.items())


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _build_user_filter(*, username: str | None, start_after: str | None) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = [USER_CREATED_AT_MISSING]
    if username is not None:
        clauses.append({"_id": username})
    elif start_after is not None:
        clauses.append({"_id": {"$gt": start_after}})
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


async def _resolve_game_date_hint(collection: Any) -> str:
    cursor = await collection.list_indexes()
    async for index_doc in cursor:
        index_name = index_doc.get("name")
        if index_name == "us_d_desc":
            return "us_d_desc"
        if _index_pattern(index_doc) == US_D_DESC_PATTERN and isinstance(index_name, str):
            return index_name
    raise RuntimeError(
        "Missing required game profile compound index [('us', 1), ('d', -1)]. "
        "Create it first, then rerun this backfill."
    )


async def _find_earliest_game_date(
    collection: Any,
    *,
    username: str,
    hint: str,
    max_time_ms: int,
) -> datetime | None:
    doc = await collection.find_one(
        {"us": username},
        projection={"d": 1},
        sort=[("d", 1)],
        hint=hint,
        max_time_ms=max_time_ms,
    )
    if doc is None or "d" not in doc:
        return None
    return _as_utc(doc["d"])


async def _flush_updates(
    collection: Any,
    pending_updates: list[UpdateOne],
    stats: BackfillStats,
    *,
    dry_run: bool,
) -> None:
    if not pending_updates:
        return
    stats.batches_flushed += 1
    stats.update_ops += len(pending_updates)
    if dry_run:
        pending_updates.clear()
        return
    result = await collection.bulk_write(pending_updates, ordered=False)
    stats.modified_docs += int(result.modified_count)
    pending_updates.clear()


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill missing user.createdAt from the earliest game date. "
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
        help="Write createdAt backfills to MongoDB. Without this flag the script is dry-run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum number of legacy users to scan (0 means no limit).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Bulk update batch size when --apply is used.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=250,
        help="Print progress every N scanned users.",
    )
    parser.add_argument(
        "--start-after",
        default=None,
        help="Resume scanning after the given username (_id sort order).",
    )
    parser.add_argument(
        "--username",
        default=None,
        help="Only inspect/backfill one specific username.",
    )
    parser.add_argument(
        "--max-time-ms",
        type=int,
        default=5000,
        help="Mongo maxTimeMS for each earliest-game lookup.",
    )
    args = parser.parse_args()

    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    if args.progress_every <= 0:
        raise SystemExit("--progress-every must be positive")
    if args.limit < 0:
        raise SystemExit("--limit must be >= 0")
    if args.max_time_ms <= 0:
        raise SystemExit("--max-time-ms must be positive")
    if args.username is not None and args.start_after is not None:
        raise SystemExit("--username and --start-after are mutually exclusive")

    started = monotonic()
    stats = BackfillStats()
    pending_updates: list[UpdateOne] = []

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]
    user_collection = db.user
    game_collection = db.game

    try:
        hint = await _resolve_game_date_hint(game_collection)
        print(
            "Using game index hint %r. Mode: %s" % (hint, "apply" if args.apply else "dry-run"),
            flush=True,
        )

        user_filter = _build_user_filter(username=args.username, start_after=args.start_after)
        cursor = user_collection.find(user_filter, projection={"_id": 1}, sort=[("_id", 1)])
        cursor = cursor.batch_size(args.batch_size)

        async for user_doc in cursor:
            username = user_doc["_id"]
            stats.scanned_users += 1

            earliest_game = await _find_earliest_game_date(
                game_collection,
                username=username,
                hint=hint,
                max_time_ms=args.max_time_ms,
            )
            if earliest_game is None:
                stats.no_games += 1
            else:
                stats.matched_games += 1
                pending_updates.append(
                    UpdateOne(
                        {
                            "_id": username,
                            "$or": [
                                {"createdAt": {"$exists": False}},
                                {"createdAt": None},
                            ],
                        },
                        {"$set": {"createdAt": earliest_game}},
                    )
                )

            should_flush = len(pending_updates) >= args.batch_size
            limit_reached = args.limit > 0 and stats.scanned_users >= args.limit

            if should_flush or limit_reached:
                await _flush_updates(
                    user_collection,
                    pending_updates,
                    stats,
                    dry_run=not args.apply,
                )

            if stats.scanned_users % args.progress_every == 0 or limit_reached:
                elapsed = monotonic() - started
                print(
                    (
                        "scanned=%d matched_games=%d no_games=%d pending=%d "
                        "update_ops=%d modified=%d elapsed=%.1fs last_user=%s"
                    )
                    % (
                        stats.scanned_users,
                        stats.matched_games,
                        stats.no_games,
                        len(pending_updates),
                        stats.update_ops,
                        stats.modified_docs,
                        elapsed,
                        username,
                    ),
                    flush=True,
                )

            if limit_reached:
                break

        await _flush_updates(
            user_collection,
            pending_updates,
            stats,
            dry_run=not args.apply,
        )

        elapsed = monotonic() - started
        print(
            (
                "DONE scanned=%d matched_games=%d no_games=%d "
                "update_ops=%d modified=%d batches=%d elapsed=%.1fs"
            )
            % (
                stats.scanned_users,
                stats.matched_games,
                stats.no_games,
                stats.update_ops,
                stats.modified_docs,
                stats.batches_flushed,
                elapsed,
            ),
            flush=True,
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
