from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from glicko2.glicko2 import MU, PHI, SIGMA
from pymongo import AsyncMongoClient, UpdateOne
from settings import MONGO_DB_NAME, MONGO_HOST

PERF_FIELDS = frozenset(("gl", "la", "nb"))
GL_FIELDS = frozenset(("r", "d", "v"))
RATING_MAP_FIELDS = ("perfs", "pperfs")


@dataclass
class CompactionPlan:
    user_id: object
    expected_fields: dict[str, object]
    unset_fields: dict[str, str]
    perfs_entries: int
    pperfs_entries: int
    unsafe_entries: int

    @property
    def entry_count(self) -> int:
        return self.perfs_entries + self.pperfs_entries

    @property
    def query(self) -> dict[str, object]:
        return {"_id": self.user_id, **self.expected_fields}


@dataclass
class CompactionStats:
    scanned_users: int = 0
    candidate_users: int = 0
    candidate_entries: int = 0
    candidate_perfs_entries: int = 0
    candidate_pperfs_entries: int = 0
    unsafe_entries: int = 0
    matched_users: int = 0
    modified_users: int = 0
    conflicted_users: int = 0


def _matches_number(value: object, expected: float) -> bool:
    return (
        isinstance(value, int | float)
        and not isinstance(value, bool)
        and float(value) == float(expected)
    )


def is_exact_default_perf(value: object) -> bool:
    """Return whether a stored entry is safe to remove as an unused default."""
    if not isinstance(value, Mapping) or set(value) != PERF_FIELDS:
        return False

    gl = value.get("gl")
    if not isinstance(gl, Mapping) or set(gl) != GL_FIELDS:
        return False

    nb = value.get("nb")
    return (
        isinstance(nb, int)
        and not isinstance(nb, bool)
        and nb == 0
        and isinstance(value.get("la"), datetime)
        and _matches_number(gl.get("r"), MU)
        and _matches_number(gl.get("d"), PHI)
        and _matches_number(gl.get("v"), SIGMA)
    )


def build_compaction_plan(doc: Mapping[str, object]) -> CompactionPlan:
    expected_fields: dict[str, object] = {}
    unset_fields: dict[str, str] = {}
    entry_counts = {field: 0 for field in RATING_MAP_FIELDS}
    unsafe_entries = 0

    for map_field in RATING_MAP_FIELDS:
        rating_map = doc.get(map_field)
        if not isinstance(rating_map, Mapping):
            continue

        for variant, entry in rating_map.items():
            if not is_exact_default_perf(entry):
                continue
            if not isinstance(variant, str) or "." in variant or variant.startswith("$"):
                unsafe_entries += 1
                continue

            path = f"{map_field}.{variant}"
            expected_fields[path] = entry
            unset_fields[path] = ""
            entry_counts[map_field] += 1

    return CompactionPlan(
        user_id=doc.get("_id"),
        expected_fields=expected_fields,
        unset_fields=unset_fields,
        perfs_entries=entry_counts["perfs"],
        pperfs_entries=entry_counts["pperfs"],
        unsafe_entries=unsafe_entries,
    )


async def apply_compaction_batch(
    collection: Any,
    plans: Sequence[CompactionPlan],
) -> tuple[int, int]:
    operations = [
        UpdateOne(plan.query, {"$unset": plan.unset_fields})
        for plan in plans
        if plan.entry_count > 0
    ]
    if not operations:
        return 0, 0

    result = await collection.bulk_write(operations, ordered=False)
    return int(result.matched_count), int(result.modified_count)


def _write_json_summary(path: str, stats: CompactionStats, *, apply: bool) -> None:
    payload = {
        "mode": "apply" if apply else "dry-run",
        **asdict(stats),
    }
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=True, sort_keys=True, indent=2)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove unused default variant entries from user perfs and pperfs. "
            "Dry-run by default. Deploy sparse-rating server code before applying. "
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
        "--apply",
        action="store_true",
        help="Write compaction updates. Without this flag the script is dry-run.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Mongo cursor and write batch size (default: 100)",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=0.25,
        help="Delay after each applied batch to reduce database load (default: 0.25)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Scan at most this many users; zero means no limit",
    )
    parser.add_argument(
        "--start-after",
        default="",
        help="Resume after this username, using ascending _id order",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=1000,
        help="Print aggregate progress after this many scanned users (default: 1000)",
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Optional path for an aggregate JSON summary",
    )
    args = parser.parse_args(argv)

    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if args.pause_seconds < 0:
        parser.error("--pause-seconds cannot be negative")
    if args.limit < 0:
        parser.error("--limit cannot be negative")
    if args.progress_every < 1:
        parser.error("--progress-every must be at least 1")

    return args


async def compact_user_rating_maps(args: argparse.Namespace) -> CompactionStats:
    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    collection = client[args.mongo_db].user
    stats = CompactionStats()
    pending: list[CompactionPlan] = []

    query: dict[str, object] = {
        "$or": [
            {"perfs": {"$type": "object"}},
            {"pperfs": {"$type": "object"}},
        ]
    }
    if args.start_after:
        query["_id"] = {"$gt": args.start_after}

    cursor = (
        collection.find(
            query,
            projection={"_id": 1, "perfs": 1, "pperfs": 1},
        )
        .sort("_id", 1)
        .batch_size(args.batch_size)
    )
    if args.limit > 0:
        cursor = cursor.limit(args.limit)

    async def flush_pending() -> None:
        if not pending:
            return
        matched, modified = await apply_compaction_batch(collection, pending)
        stats.matched_users += matched
        stats.modified_users += modified
        stats.conflicted_users += len(pending) - matched
        pending.clear()
        if args.pause_seconds > 0:
            await asyncio.sleep(args.pause_seconds)

    try:
        async for doc in cursor:
            stats.scanned_users += 1
            plan = build_compaction_plan(doc)
            stats.unsafe_entries += plan.unsafe_entries

            if plan.entry_count > 0:
                stats.candidate_users += 1
                stats.candidate_entries += plan.entry_count
                stats.candidate_perfs_entries += plan.perfs_entries
                stats.candidate_pperfs_entries += plan.pperfs_entries
                if args.apply:
                    pending.append(plan)
                    if len(pending) >= args.batch_size:
                        await flush_pending()

            if stats.scanned_users % args.progress_every == 0:
                print(
                    f"scanned={stats.scanned_users} candidate_users={stats.candidate_users} "
                    f"candidate_entries={stats.candidate_entries} "
                    f"modified_users={stats.modified_users}",
                    flush=True,
                )

        if args.apply:
            await flush_pending()
    finally:
        await client.close()

    return stats


async def async_main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    print(f"Mode: {'apply' if args.apply else 'dry-run'}")
    if args.apply:
        print("Apply mode assumes the sparse-rating server code is already deployed.")
    stats = await compact_user_rating_maps(args)
    print(json.dumps(asdict(stats), ensure_ascii=True, sort_keys=True))

    if args.json_out:
        await asyncio.to_thread(_write_json_summary, args.json_out, stats, apply=args.apply)
        print(f"Wrote aggregate JSON summary to {args.json_out}")

    if not args.apply:
        print("No changes written. Review the counts, then rerun with --apply.")
    elif stats.conflicted_users > 0:
        print(
            f"{stats.conflicted_users} users changed during compaction and were skipped; "
            "rerun the script safely."
        )

    if stats.unsafe_entries > 0:
        print(
            f"Skipped {stats.unsafe_entries} default entries with unsafe field names; "
            "inspect them manually."
        )

    return 1 if stats.conflicted_users > 0 or stats.unsafe_entries > 0 else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(async_main()))
