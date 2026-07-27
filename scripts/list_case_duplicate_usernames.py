from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from pymongo import AsyncMongoClient


def parse_args() -> argparse.Namespace:
    server_dir = Path(__file__).resolve().parents[1] / "server"
    if str(server_dir) not in sys.path:
        sys.path.insert(0, str(server_dir))

    from settings import MONGO_DB_NAME, MONGO_HOST

    parser = argparse.ArgumentParser(
        description=(
            "List existing users whose usernames differ only by letter case. "
            "Cleanup modes are dry-run unless --apply is passed."
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
        "--limit",
        type=int,
        default=0,
        help="Maximum number of duplicate groups to print (0 means no limit).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print duplicate groups as JSON.",
    )
    parser.add_argument(
        "--check-username-lower",
        action="store_true",
        help="Also report existing username_lower fields that do not match lowercase _id.",
    )
    parser.add_argument(
        "--delete-disabled-duplicates",
        action="store_true",
        help=(
            "Plan deletion of duplicate users where enabled is explicitly False. "
            "Never deletes every user in a duplicate group."
        ),
    )
    parser.add_argument(
        "--delete-unrated-when-single-rated",
        action="store_true",
        help=(
            "Plan deletion of duplicate users with zero rated games when exactly one user "
            "in that duplicate group has rated games."
        ),
    )
    parser.add_argument(
        "--delete-zero-game-unrated-duplicates",
        action="store_true",
        help=(
            "Plan deletion of duplicate users with zero rated games and zero game documents. "
            "If every user in the group has zero games, keep one survivor."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the planned deletions. Without this flag cleanup modes only print a dry-run plan.",
    )
    return parser.parse_args()


def _string_or_empty(value: Any) -> str:
    return "" if value is None else str(value)


async def find_case_duplicate_groups(db: Any, *, limit: int) -> list[dict[str, Any]]:
    pipeline: list[dict[str, Any]] = [
        {
            "$project": {
                "_id": 0,
                "username": "$_id",
                "usernameLower": {"$toLower": "$_id"},
                "title": 1,
                "enabled": 1,
                "createdAt": 1,
                "oauth_provider": 1,
                "perfs": 1,
            }
        },
        {
            "$group": {
                "_id": "$usernameLower",
                "count": {"$sum": 1},
                "users": {
                    "$push": {
                        "username": "$username",
                        "title": "$title",
                        "enabled": "$enabled",
                        "createdAt": "$createdAt",
                        "oauth_provider": "$oauth_provider",
                        "perfs": "$perfs",
                    }
                },
            }
        },
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"_id": 1}},
    ]
    if limit > 0:
        pipeline.append({"$limit": limit})

    cursor = await db.user.aggregate(pipeline, allowDiskUse=True)
    return await cursor.to_list(length=None)


def summarize_perfs(perfs: Any) -> dict[str, Any]:
    if not isinstance(perfs, dict):
        return {
            "rated_games": 0,
            "rated_variants": [],
            "best_rating": None,
            "best_variant": None,
            "last_rated": None,
        }

    rated_games = 0
    rated_variants: list[str] = []
    best_rating: int | None = None
    best_variant: str | None = None
    last_rated = None

    for variant, perf in perfs.items():
        if not isinstance(perf, dict):
            continue

        nb = perf.get("nb", 0)
        if not isinstance(nb, (int, float)):
            continue
        if nb <= 0:
            continue

        rated_games += int(nb)
        rated_variants.append(str(variant))

        gl = perf.get("gl")
        if isinstance(gl, dict):
            rating = gl.get("r")
            if isinstance(rating, (int, float)):
                rounded_rating = round(rating)
                if best_rating is None or rounded_rating > best_rating:
                    best_rating = rounded_rating
                    best_variant = str(variant)

        la = perf.get("la")
        if la is not None and (last_rated is None or la > last_rated):
            last_rated = la

    return {
        "rated_games": rated_games,
        "rated_variants": sorted(rated_variants),
        "best_rating": best_rating,
        "best_variant": best_variant,
        "last_rated": last_rated,
    }


def enrich_duplicate_groups(groups: list[dict[str, Any]]) -> None:
    for group in groups:
        for user in group.get("users", []):
            user["perf_summary"] = summarize_perfs(user.pop("perfs", None))


async def enrich_game_counts(db: Any, groups: list[dict[str, Any]]) -> None:
    usernames = sorted(
        {
            user["username"]
            for group in groups
            for user in group.get("users", [])
            if user["perf_summary"]["rated_games"] == 0
        }
    )
    if not usernames:
        return

    pipeline = [
        {"$match": {"us": {"$in": usernames}}},
        {"$unwind": "$us"},
        {"$match": {"us": {"$in": usernames}}},
        {"$group": {"_id": "$us", "count": {"$sum": 1}}},
    ]
    cursor = await db.game.aggregate(pipeline, allowDiskUse=True)
    counts = {doc["_id"]: int(doc["count"]) for doc in await cursor.to_list(length=None)}

    for group in groups:
        for user in group.get("users", []):
            if user["perf_summary"]["rated_games"] == 0:
                user["game_count"] = counts.get(user["username"], 0)


def _group_remaining_users(
    group: dict[str, Any], planned_usernames: set[str]
) -> list[dict[str, Any]]:
    return [user for user in group["users"] if user["username"] not in planned_usernames]


def choose_survivor(users: list[dict[str, Any]]) -> dict[str, Any]:
    return max(
        users,
        key=lambda user: (
            user.get("createdAt") is not None,
            str(user.get("createdAt") or ""),
            user["username"].lower(),
            user["username"],
        ),
    )


def build_cleanup_plan(
    groups: list[dict[str, Any]],
    *,
    delete_disabled_duplicates: bool,
    delete_unrated_when_single_rated: bool,
    delete_zero_game_unrated_duplicates: bool,
) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    planned_usernames: set[str] = set()

    for group in groups:
        key = group["_id"]

        if delete_disabled_duplicates:
            remaining_users = _group_remaining_users(group, planned_usernames)
            disabled_users = [user for user in remaining_users if user.get("enabled") is False]
            if len(disabled_users) >= len(remaining_users):
                disabled_users = sorted(
                    disabled_users,
                    key=lambda user: (
                        user["perf_summary"]["rated_games"],
                        user["username"].lower(),
                    ),
                )[:-1]

            for user in disabled_users:
                username = user["username"]
                if username in planned_usernames:
                    continue
                planned_usernames.add(username)
                plan.append(
                    {
                        "username": username,
                        "lowercase_key": key,
                        "reason": "duplicate account has enabled=False",
                    }
                )

        if delete_unrated_when_single_rated:
            remaining_users = _group_remaining_users(group, planned_usernames)
            rated_users = [
                user for user in remaining_users if user["perf_summary"]["rated_games"] > 0
            ]
            if len(rated_users) != 1:
                continue

            for user in remaining_users:
                if user["perf_summary"]["rated_games"] != 0:
                    continue
                username = user["username"]
                if username in planned_usernames:
                    continue
                planned_usernames.add(username)
                plan.append(
                    {
                        "username": username,
                        "lowercase_key": key,
                        "reason": (
                            "duplicate account has zero rated games and the group has "
                            "exactly one rated account"
                        ),
                    }
                )

        if delete_zero_game_unrated_duplicates:
            remaining_users = _group_remaining_users(group, planned_usernames)
            if any(user["perf_summary"]["rated_games"] > 0 for user in remaining_users):
                continue

            zero_game_users = [user for user in remaining_users if user.get("game_count") == 0]
            if not zero_game_users:
                continue

            if len(zero_game_users) >= len(remaining_users):
                survivor = choose_survivor(zero_game_users)
                zero_game_users = [
                    user for user in zero_game_users if user["username"] != survivor["username"]
                ]

            for user in zero_game_users:
                username = user["username"]
                if username in planned_usernames:
                    continue
                planned_usernames.add(username)
                plan.append(
                    {
                        "username": username,
                        "lowercase_key": key,
                        "reason": (
                            "duplicate account has zero rated games and zero game documents"
                        ),
                        "rated_games": user["perf_summary"]["rated_games"],
                        "game_count": user["game_count"],
                    }
                )

    return plan


async def find_username_lower_mismatches(db: Any) -> list[dict[str, Any]]:
    pipeline = [
        {
            "$match": {
                "username_lower": {
                    "$exists": True,
                    "$type": "string",
                }
            }
        },
        {
            "$project": {
                "_id": 0,
                "username": "$_id",
                "username_lower": 1,
                "expected": {"$toLower": "$_id"},
            }
        },
        {
            "$match": {
                "$expr": {
                    "$ne": ["$username_lower", "$expected"],
                }
            }
        },
        {"$sort": {"username": 1}},
    ]
    cursor = await db.user.aggregate(pipeline, allowDiskUse=True)
    return await cursor.to_list(length=None)


def print_text_report(
    groups: list[dict[str, Any]],
    mismatches: list[dict[str, Any]],
    cleanup_plan: list[dict[str, Any]],
    *,
    apply: bool,
) -> None:
    if not groups:
        print("No case-only duplicate usernames found.")
    else:
        print("Case-only duplicate username groups: %d" % len(groups))
        for group in groups:
            print()
            print("lowercase key: %s" % group["_id"])
            users = sorted(group["users"], key=lambda user: user["username"].lower())
            for user in users:
                perf_summary = user["perf_summary"]
                details = []
                details.append("rated_games=%d" % perf_summary["rated_games"])
                if user.get("title"):
                    details.append("title=%s" % user["title"])
                if "enabled" in user:
                    details.append("enabled=%s" % user["enabled"])
                if user.get("oauth_provider"):
                    details.append("oauth_provider=%s" % user["oauth_provider"])
                if "game_count" in user:
                    details.append("games=%d" % user["game_count"])
                if user.get("createdAt"):
                    details.append("createdAt=%s" % user["createdAt"])
                if perf_summary["last_rated"]:
                    details.append("last_rated=%s" % perf_summary["last_rated"])
                if perf_summary["best_rating"] is not None:
                    details.append(
                        "best=%s:%s" % (perf_summary["best_variant"], perf_summary["best_rating"])
                    )
                if perf_summary["rated_variants"]:
                    details.append("variants=%s" % ",".join(perf_summary["rated_variants"][:8]))

                suffix = " (%s)" % ", ".join(details) if details else ""
                print("  - %s%s" % (user["username"], suffix))

    if mismatches:
        print()
        print("Existing username_lower mismatches: %d" % len(mismatches))
        for mismatch in mismatches:
            print(
                "  - %s: username_lower=%r expected=%r"
                % (
                    mismatch["username"],
                    _string_or_empty(mismatch.get("username_lower")),
                    _string_or_empty(mismatch.get("expected")),
                )
            )

    if cleanup_plan:
        print()
        print(
            "Cleanup %s: %d user(s)" % ("applied" if apply else "dry-run plan", len(cleanup_plan))
        )
        for item in cleanup_plan:
            stats = []
            if "rated_games" in item:
                stats.append("rated_games=%s" % item["rated_games"])
            if "game_count" in item:
                stats.append("games=%s" % item["game_count"])
            stats_text = ", %s" % ", ".join(stats) if stats else ""
            print(
                "  - %s (lowercase key: %s%s, reason: %s)"
                % (item["username"], item["lowercase_key"], stats_text, item["reason"])
            )


async def apply_cleanup_plan(db: Any, cleanup_plan: list[dict[str, Any]]) -> int:
    if not cleanup_plan:
        return 0
    usernames = [item["username"] for item in cleanup_plan]
    result = await db.user.delete_many({"_id": {"$in": usernames}})
    return int(result.deleted_count)


async def main() -> None:
    args = parse_args()
    if args.limit < 0:
        raise SystemExit("--limit must be >= 0")
    cleanup_requested = (
        args.delete_disabled_duplicates
        or args.delete_unrated_when_single_rated
        or args.delete_zero_game_unrated_duplicates
    )
    if args.apply and not cleanup_requested:
        raise SystemExit("--apply requires at least one cleanup flag")

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    try:
        db = client[args.mongo_db]
        groups = await find_case_duplicate_groups(db, limit=args.limit)
        enrich_duplicate_groups(groups)
        if args.delete_zero_game_unrated_duplicates:
            await enrich_game_counts(db, groups)
        mismatches = await find_username_lower_mismatches(db) if args.check_username_lower else []
        cleanup_plan = build_cleanup_plan(
            groups,
            delete_disabled_duplicates=args.delete_disabled_duplicates,
            delete_unrated_when_single_rated=args.delete_unrated_when_single_rated,
            delete_zero_game_unrated_duplicates=args.delete_zero_game_unrated_duplicates,
        )

        deleted_count = 0
        if args.apply:
            deleted_count = await apply_cleanup_plan(db, cleanup_plan)

        if args.json:
            print(
                json.dumps(
                    {
                        "duplicate_groups": groups,
                        "username_lower_mismatches": mismatches,
                        "cleanup": {
                            "apply": args.apply,
                            "planned_count": len(cleanup_plan),
                            "deleted_count": deleted_count,
                            "users": cleanup_plan,
                        },
                    },
                    default=str,
                    ensure_ascii=True,
                    indent=2,
                )
            )
            return

        print_text_report(groups, mismatches, cleanup_plan, apply=args.apply)
        if args.apply:
            print()
            print("Deleted users: %d" % deleted_count)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
