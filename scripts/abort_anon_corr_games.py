from __future__ import annotations

import argparse
import asyncio
import re
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

from pymongo import AsyncMongoClient

from compress import R2C
from const import ABORTED, ANON_PREFIX
from settings import MONGO_DB_NAME, MONGO_HOST


DEFAULT_STUCK_GAME_IDS = ("yJAvr1xX", "F7XTMwl9")


def _normalize_game_ids(game_ids: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in game_ids:
        value = raw.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _is_anon_vs_anon(users: Any) -> bool:
    if not isinstance(users, list) or len(users) != 2:
        return False
    return all(isinstance(user, str) and user.startswith(ANON_PREFIX) for user in users)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Abort correspondence games safely in MongoDB. "
            "Dry-run by default. Run with PYTHONPATH=server."
        )
    )
    parser.add_argument(
        "--mongo-host",
        default=MONGO_HOST,
        help="Mongo connection URI (defaults to settings.MONGO_HOST).",
    )
    parser.add_argument(
        "--mongo-db",
        default=MONGO_DB_NAME,
        help="Mongo database name (defaults to settings.MONGO_DB_NAME).",
    )
    parser.add_argument(
        "--game-id",
        action="append",
        default=[],
        help="Game id to abort. Repeat for multiple ids.",
    )
    parser.add_argument(
        "--all-anon-vs-anon",
        action="store_true",
        help="Target every in-progress anon-vs-anon correspondence game.",
    )
    parser.add_argument(
        "--include-default-stuck",
        action="store_true",
        help=(
            f"Also include the known stuck legacy game ids ({', '.join(DEFAULT_STUCK_GAME_IDS)})."
        ),
    )
    parser.add_argument(
        "--allow-non-anon",
        action="store_true",
        help="Allow aborting non-anon games when explicit --game-id is provided.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates to MongoDB. Without this flag, only print candidates.",
    )
    args = parser.parse_args()

    requested_ids = _normalize_game_ids(args.game_id)
    if args.include_default_stuck:
        requested_ids = _normalize_game_ids([*requested_ids, *DEFAULT_STUCK_GAME_IDS])

    if (not args.all_anon_vs_anon) and len(requested_ids) == 0:
        raise SystemExit(
            "Nothing selected. Provide --game-id, or use --all-anon-vs-anon, "
            "or pass --include-default-stuck."
        )

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    db = client[args.mongo_db]
    game_collection = db.game

    try:
        query: dict[str, Any] = {
            "c": True,
            "s": {"$lt": int(ABORTED)},
        }
        if args.all_anon_vs_anon:
            anon_prefix_re = f"^{re.escape(ANON_PREFIX)}"
            query["us.0"] = {"$regex": anon_prefix_re}
            query["us.1"] = {"$regex": anon_prefix_re}
        if len(requested_ids) > 0:
            query["_id"] = {"$in": requested_ids}

        projection = {
            "_id": 1,
            "us": 1,
            "c": 1,
            "s": 1,
            "r": 1,
            "d": 1,
            "v": 1,
        }
        docs = await game_collection.find(query, projection=projection).sort("d", 1).to_list(None)

        if len(docs) == 0:
            print("No matching in-progress correspondence games found.", flush=True)
            return

        now = datetime.now(timezone.utc).isoformat()
        candidates: list[dict[str, Any]] = []
        skipped: list[tuple[str, str]] = []

        for doc in docs:
            game_id = str(doc.get("_id"))
            users = doc.get("us")
            if not _is_anon_vs_anon(users) and not args.allow_non_anon:
                skipped.append((game_id, "not anon-vs-anon (use --allow-non-anon to override)"))
                continue
            if doc.get("c") is not True:
                skipped.append((game_id, "not correspondence game"))
                continue
            if int(doc.get("s", ABORTED)) >= int(ABORTED):
                skipped.append((game_id, "already finished"))
                continue
            candidates.append(doc)

        print(
            "Mode: %s | matched=%d candidates=%d skipped=%d"
            % ("apply" if args.apply else "dry-run", len(docs), len(candidates), len(skipped)),
            flush=True,
        )

        for doc in candidates:
            print(
                "CANDIDATE id=%s status=%s result=%s date=%s variant=%s users=%s"
                % (
                    doc.get("_id"),
                    doc.get("s"),
                    doc.get("r"),
                    doc.get("d"),
                    doc.get("v"),
                    doc.get("us"),
                ),
                flush=True,
            )

        for game_id, reason in skipped:
            print("SKIP id=%s reason=%s" % (game_id, reason), flush=True)

        if not args.apply:
            print("Dry-run only. Re-run with --apply to persist updates.", flush=True)
            return

        modified = 0
        for doc in candidates:
            result = await game_collection.update_one(
                {"_id": doc["_id"], "s": {"$lt": int(ABORTED)}},
                {
                    "$set": {
                        "s": int(ABORTED),
                        "r": R2C["*"],
                        "abortedByScriptAt": now,
                    }
                },
            )
            modified += int(result.modified_count)

        print("Updated %d/%d candidate game(s)." % (modified, len(candidates)), flush=True)
        print(
            "If any aborted game is already loaded in a running server process, restart that process "
            "to clear in-memory correspondence blockers immediately.",
            flush=True,
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
