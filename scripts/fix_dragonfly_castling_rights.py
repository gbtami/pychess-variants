from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from typing import Any

from pymongo import AsyncMongoClient

from settings import MONGO_DB_NAME, MONGO_HOST


VARIANT_NAME = "dragonfly"
OLD_START_FEN = "rbbknnr/ppppppp/7/7/7/PPPPPPP/RBBKNNR[] w - - 0 1"
NEW_START_FEN = "rbbknnr/ppppppp/7/7/7/PPPPPPP/RBBKNNR[] w KQkq - 0 1"
OLD_START_FEN_LINE = f"startFen = {OLD_START_FEN}"
NEW_START_FEN_LINE = f"startFen = {NEW_START_FEN}"


def corrected_values(doc: dict[str, Any]) -> tuple[str, str] | None:
    """Return corrected INI/start FEN, or None when the document is already fixed."""
    ini = doc.get("ini")
    start_fen = doc.get("startFen")
    if not isinstance(ini, str) or not isinstance(start_fen, str):
        raise RuntimeError("Dragonfly document must contain string ini and startFen fields.")

    old_line_count = ini.count(OLD_START_FEN_LINE)
    new_line_count = ini.count(NEW_START_FEN_LINE)

    if start_fen == NEW_START_FEN and old_line_count == 0 and new_line_count == 1:
        return None

    if start_fen != OLD_START_FEN:
        raise RuntimeError(
            f"Unexpected Dragonfly startFen {start_fen!r}; refusing to modify the document."
        )
    if old_line_count != 1 or new_line_count != 0:
        raise RuntimeError(
            "Expected exactly one old Dragonfly startFen line and no corrected line in ini; "
            "refusing to modify the document."
        )

    return ini.replace(OLD_START_FEN_LINE, NEW_START_FEN_LINE), NEW_START_FEN


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Add the missing Dragonfly castling rights to catalogued_variant. "
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
        help="Write the correction to MongoDB. Without this flag the script is dry-run.",
    )
    args = parser.parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    collection = client[args.mongo_db].catalogued_variant

    try:
        doc = await collection.find_one({"_id": VARIANT_NAME})
        if doc is None:
            raise RuntimeError("Dragonfly catalogued variant document was not found.")

        corrected = corrected_values(doc)
        if corrected is None:
            print("Dragonfly already has KQkq castling rights; no update is needed.")
            return

        corrected_ini, corrected_start_fen = corrected
        print(f"Mode: {'apply' if args.apply else 'dry-run'}")
        print(f"Old startFen: {OLD_START_FEN}")
        print(f"New startFen: {NEW_START_FEN}")

        if not args.apply:
            print("No changes written. Rerun with --apply immediately before deployment.")
            return

        result = await collection.update_one(
            {
                "_id": VARIANT_NAME,
                "ini": doc["ini"],
                "startFen": OLD_START_FEN,
            },
            {
                "$set": {
                    "ini": corrected_ini,
                    "startFen": corrected_start_fen,
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
        )
        if result.matched_count != 1 or result.modified_count != 1:
            raise RuntimeError(
                "Dragonfly changed after it was read; no update was applied. Inspect and rerun."
            )

        print("Updated Dragonfly castling rights. Restart the server before serving new games.")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
