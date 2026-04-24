import argparse
import asyncio
import json
from pathlib import Path
import sys

from pymongo import AsyncMongoClient


def parse_args() -> argparse.Namespace:
    server_dir = Path(__file__).resolve().parents[1] / "server"
    if str(server_dir) not in sys.path:
        sys.path.insert(0, str(server_dir))

    from cheat_report import CHEAT_REPORT_COLLECTION
    from settings import MONGO_DB_NAME, MONGO_HOST

    parser = argparse.ArgumentParser(description="Print stored cheat reports.")
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
    parser.add_argument("--limit", type=int, default=50, help="Maximum number of reports to print.")
    parser.add_argument("--suspect", help="Filter by suspect username.")
    parser.add_argument("--game", help="Filter by game id.")
    parser.add_argument("--kind", default=None, help="Filter by report kind.")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full documents as JSON instead of a compact summary.",
    )
    args = parser.parse_args()
    args.cheat_report_collection = CHEAT_REPORT_COLLECTION
    return args


async def main() -> None:
    args = parse_args()

    client = AsyncMongoClient(args.mongo_host, tz_aware=True)
    try:
        db = client[args.mongo_db]
        query: dict[str, object] = {}
        if args.suspect:
            query["suspect"] = args.suspect
        if args.game:
            query["gameId"] = args.game
        if args.kind:
            query["kind"] = args.kind

        cursor = (
            db[args.cheat_report_collection].find(query).sort("createdAt", -1).limit(args.limit)
        )
        docs = await cursor.to_list(length=args.limit)

        if not docs:
            print("No cheat reports found.")
            return

        if args.json:
            for doc in docs:
                print(json.dumps(doc, default=str, ensure_ascii=True))
            return

        for doc in docs:
            print(
                "{createdAt} {kind} action={action} suspect={suspect} opponent={opponent} "
                "game={gameId} variant={variant} ply={ply} rated={rated}".format(
                    createdAt=doc.get("createdAt"),
                    kind=doc.get("kind"),
                    action=doc.get("action"),
                    suspect=doc.get("suspect"),
                    opponent=doc.get("opponent"),
                    gameId=doc.get("gameId"),
                    variant=doc.get("variant"),
                    ply=doc.get("ply"),
                    rated=doc.get("rated"),
                )
            )
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
