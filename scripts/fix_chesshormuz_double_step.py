from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime
from typing import Any

from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST

VARIANT_NAME = "chesshormuz"
DOUBLE_STEP_LINE = "doubleStep = true"
WHITE_REGION_LINE = "doubleStepRegionWhite = *2"
BLACK_REGION_LINE = "doubleStepRegionBlack = *8"
CORRECTED_DOUBLE_STEP_BLOCK = f"{DOUBLE_STEP_LINE}\n{WHITE_REGION_LINE}\n{BLACK_REGION_LINE}"


def corrected_ini(doc: dict[str, Any]) -> str | None:
    """Return corrected INI, or None when the document is already fixed."""
    ini = doc.get("ini")
    if not isinstance(ini, str):
        raise TypeError("Chesshormuz document must contain a string ini field.")

    double_step_count = ini.count(DOUBLE_STEP_LINE)
    white_region_count = ini.count(WHITE_REGION_LINE)
    black_region_count = ini.count(BLACK_REGION_LINE)

    if double_step_count == white_region_count == black_region_count == 1:
        return None

    if double_step_count != 1 or white_region_count != 0 or black_region_count != 0:
        raise RuntimeError(
            "Expected exactly one Chesshormuz doubleStep line and no explicit double-step "
            "regions; refusing to modify the document."
        )

    return ini.replace(DOUBLE_STEP_LINE, CORRECTED_DOUBLE_STEP_BLOCK)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Add the missing Chesshormuz pawn double-step regions to catalogued_variant. "
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
            raise RuntimeError("Chesshormuz catalogued variant document was not found.")

        corrected = corrected_ini(doc)
        if corrected is None:
            print("Chesshormuz already has both pawn double-step regions; no update is needed.")
            return

        print(f"Mode: {'apply' if args.apply else 'dry-run'}")
        print(f"Adding: {WHITE_REGION_LINE}")
        print(f"Adding: {BLACK_REGION_LINE}")

        if not args.apply:
            print("No changes written. Rerun with --apply immediately before deployment.")
            return

        result = await collection.update_one(
            {
                "_id": VARIANT_NAME,
                "ini": doc["ini"],
            },
            {
                "$set": {
                    "ini": corrected,
                    "updatedAt": datetime.now(UTC),
                }
            },
        )
        if result.matched_count != 1 or result.modified_count != 1:
            raise RuntimeError(
                "Chesshormuz changed after it was read; no update was applied. Inspect and rerun."
            )

        print(
            "Updated Chesshormuz pawn double-step regions. Restart the server before serving new games."
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
