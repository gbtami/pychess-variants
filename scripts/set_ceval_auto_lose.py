import argparse
import asyncio
from pathlib import Path
import sys

from pymongo import AsyncMongoClient


def parse_args() -> argparse.Namespace:
    server_dir = Path(__file__).resolve().parents[1] / "server"
    if str(server_dir) not in sys.path:
        sys.path.insert(0, str(server_dir))

    from cheat_report import CEVAL_AUTO_LOSE_CONFIG_NAME
    from settings import MONGO_DB_NAME, MONGO_HOST

    parser = argparse.ArgumentParser(description="Inspect or update ceval auto-forfeit config.")
    parser.add_argument(
        "action",
        choices=("status", "on", "off"),
        nargs="?",
        default="status",
        help="Read current value or set it on/off.",
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

    args = parser.parse_args()
    args.config_name = CEVAL_AUTO_LOSE_CONFIG_NAME
    return args


async def main() -> None:
    args = parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    try:
        db = client[args.mongo_db]
        query_filter = {"name": args.config_name}

        if args.action == "status":
            doc = await db.config.find_one(query_filter, projection={"_id": 0})
            if doc is None:
                print(f"{args.config_name}=False (missing config document)")
            else:
                print(f"{args.config_name}={bool(doc.get('value'))}")
            return

        new_value = args.action == "on"
        await db.config.update_one(
            query_filter,
            {"$set": {"value": new_value}},
            upsert=True,
        )
        print(f"{args.config_name}={new_value}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
