from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import Any

from pymongo import AsyncMongoClient, UpdateOne

from settings import MONGO_DB_NAME, MONGO_HOST
from user_stats import DEFAULT_USER_COUNT

RESULT_CODES = ("a", "b", "c")


@dataclass
class BackfillStats:
    aggregated_users: int = 0
    update_ops: int = 0
    modified_docs: int = 0
    matched_docs: int = 0
    batches_flushed: int = 0
    total_games: int = 0
    total_rated: int = 0
    total_wins: int = 0
    total_losses: int = 0
    total_draws: int = 0


def _aggregation_pipeline() -> list[dict[str, Any]]:
    # 2-player mapping:
    #   r='a' => us.0 win, us.1 loss
    #   r='b' => us.1 win, us.0 loss
    # 4-player bughouse mapping:
    #   r='a' => us.0 + us.3 win, us.1 + us.2 loss
    #   r='b' => us.1 + us.2 win, us.0 + us.3 loss
    return [
        {
            "$match": {
                "y": {"$ne": 2},
                "r": {"$in": list(RESULT_CODES)},
                "us": {"$type": "array"},
            }
        },
        {
            "$project": {
                "us": 1,
                "r": 1,
                "y": 1,
                "players": {"$size": "$us"},
            }
        },
        {"$match": {"players": {"$in": [2, 4]}}},
        {"$unwind": {"path": "$us", "includeArrayIndex": "idx"}},
        {
            "$project": {
                "username": "$us",
                "game": {"$literal": 1},
                "rated": {"$cond": [{"$eq": ["$y", 1]}, 1, 0]},
                "win": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {
                                    "$and": [
                                        {"$eq": ["$players", 2]},
                                        {
                                            "$or": [
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "a"]},
                                                        {"$eq": ["$idx", 0]},
                                                    ]
                                                },
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "b"]},
                                                        {"$eq": ["$idx", 1]},
                                                    ]
                                                },
                                            ]
                                        },
                                    ]
                                },
                                "then": 1,
                            },
                            {
                                "case": {
                                    "$and": [
                                        {"$eq": ["$players", 4]},
                                        {
                                            "$or": [
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "a"]},
                                                        {"$in": ["$idx", [0, 3]]},
                                                    ]
                                                },
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "b"]},
                                                        {"$in": ["$idx", [1, 2]]},
                                                    ]
                                                },
                                            ]
                                        },
                                    ]
                                },
                                "then": 1,
                            },
                        ],
                        "default": 0,
                    }
                },
                "loss": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {
                                    "$and": [
                                        {"$eq": ["$players", 2]},
                                        {
                                            "$or": [
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "a"]},
                                                        {"$eq": ["$idx", 1]},
                                                    ]
                                                },
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "b"]},
                                                        {"$eq": ["$idx", 0]},
                                                    ]
                                                },
                                            ]
                                        },
                                    ]
                                },
                                "then": 1,
                            },
                            {
                                "case": {
                                    "$and": [
                                        {"$eq": ["$players", 4]},
                                        {
                                            "$or": [
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "a"]},
                                                        {"$in": ["$idx", [1, 2]]},
                                                    ]
                                                },
                                                {
                                                    "$and": [
                                                        {"$eq": ["$r", "b"]},
                                                        {"$in": ["$idx", [0, 3]]},
                                                    ]
                                                },
                                            ]
                                        },
                                    ]
                                },
                                "then": 1,
                            },
                        ],
                        "default": 0,
                    }
                },
                "draw": {"$cond": [{"$eq": ["$r", "c"]}, 1, 0]},
            }
        },
        {
            "$group": {
                "_id": "$username",
                "game": {"$sum": "$game"},
                "rated": {"$sum": "$rated"},
                "win": {"$sum": "$win"},
                "loss": {"$sum": "$loss"},
                "draw": {"$sum": "$draw"},
            }
        },
    ]


def _as_user_count(doc: dict[str, Any]) -> dict[str, int]:
    return {
        "game": int(doc.get("game", 0) or 0),
        "win": int(doc.get("win", 0) or 0),
        "loss": int(doc.get("loss", 0) or 0),
        "draw": int(doc.get("draw", 0) or 0),
        "rated": int(doc.get("rated", 0) or 0),
    }


async def _flush_updates(
    user_collection: Any,
    pending: list[UpdateOne],
    stats: BackfillStats,
    *,
    dry_run: bool,
) -> None:
    if not pending:
        return

    stats.batches_flushed += 1
    stats.update_ops += len(pending)

    if dry_run:
        pending.clear()
        return

    result = await user_collection.bulk_write(pending, ordered=False)
    stats.modified_docs += int(result.modified_count)
    stats.matched_docs += int(result.matched_count)
    pending.clear()


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill user.count game stats from game history. "
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
        help="Write backfilled user.count values to MongoDB. Without this flag script is dry-run.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Bulk update batch size in apply mode.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=500,
        help="Print progress every N aggregated users.",
    )
    args = parser.parse_args()

    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    if args.progress_every <= 0:
        raise SystemExit("--progress-every must be positive")

    started = monotonic()
    stats = BackfillStats()
    pending_updates: list[UpdateOne] = []

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]
    game_collection = db.game
    user_collection = db.user

    try:
        if args.apply:
            reset_started = monotonic()
            reset_result = await user_collection.update_many(
                {}, {"$set": {"count": dict(DEFAULT_USER_COUNT)}}
            )
            reset_elapsed = (monotonic() - reset_started) * 1000.0
            print(
                "Reset user.count to defaults for %d users (modified=%d) in %.1fms"
                % (
                    int(reset_result.matched_count),
                    int(reset_result.modified_count),
                    reset_elapsed,
                ),
                flush=True,
            )

        cursor = await game_collection.aggregate(_aggregation_pipeline(), allowDiskUse=True)
        async for row in cursor:
            username = row.get("_id")
            if not isinstance(username, str) or not username:
                continue

            count_doc = _as_user_count(row)
            stats.aggregated_users += 1
            stats.total_games += count_doc["game"]
            stats.total_rated += count_doc["rated"]
            stats.total_wins += count_doc["win"]
            stats.total_losses += count_doc["loss"]
            stats.total_draws += count_doc["draw"]

            pending_updates.append(UpdateOne({"_id": username}, {"$set": {"count": count_doc}}))
            if len(pending_updates) >= args.batch_size:
                await _flush_updates(
                    user_collection,
                    pending_updates,
                    stats,
                    dry_run=not args.apply,
                )

            if stats.aggregated_users % args.progress_every == 0:
                print(
                    "Processed %d users so far (%s)"
                    % (stats.aggregated_users, "apply" if args.apply else "dry-run"),
                    flush=True,
                )

        await _flush_updates(
            user_collection,
            pending_updates,
            stats,
            dry_run=not args.apply,
        )

        elapsed = monotonic() - started
        print("--- backfill_user_count_stats summary ---", flush=True)
        print("mode=%s" % ("apply" if args.apply else "dry-run"), flush=True)
        print("aggregated_users=%d" % stats.aggregated_users, flush=True)
        print("update_ops=%d" % stats.update_ops, flush=True)
        print("batches_flushed=%d" % stats.batches_flushed, flush=True)
        print("total_games=%d" % stats.total_games, flush=True)
        print("total_rated=%d" % stats.total_rated, flush=True)
        print("total_wins=%d" % stats.total_wins, flush=True)
        print("total_losses=%d" % stats.total_losses, flush=True)
        print("total_draws=%d" % stats.total_draws, flush=True)
        if args.apply:
            print("matched_docs=%d" % stats.matched_docs, flush=True)
            print("modified_docs=%d" % stats.modified_docs, flush=True)
        print("elapsed_sec=%.2f" % elapsed, flush=True)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
