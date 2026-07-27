from __future__ import annotations

import argparse
import asyncio

from legacy_blog_migration import build_legacy_ublog_docs, markdown_path
from motor import motor_asyncio as ma
from pymongo.errors import PyMongoError
from settings import MONGO_DB_NAME, MONGO_HOST


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate legacy site blogs (blogs.py + static/blogs/*.md) into ublog_post."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to MongoDB. Default behavior is dry-run.",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Print migration actions without writing to MongoDB (default).",
    )
    parser.add_argument(
        "--author-policy",
        choices=("keep", "official-as-pychess"),
        default="keep",
        help="How to set author on migrated posts.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only the first N posts (0 means all).",
    )
    parser.add_argument(
        "--from-id",
        default="",
        help="Start processing from this legacy blog _id (inclusive).",
    )
    parser.add_argument(
        "--keep-legacy-preamble",
        action="store_true",
        help="Keep old inline title/meta/hero blocks in markdown body.",
    )
    return parser.parse_args()


async def migrate(args: argparse.Namespace) -> None:
    dry_run = not args.apply
    docs = build_legacy_ublog_docs(
        author_policy=args.author_policy,
        strip_preamble=not args.keep_legacy_preamble,
        from_id=args.from_id,
        limit=args.limit,
    )
    print(
        f"Prepared {len(docs)} posts (dry_run={dry_run}, author_policy={args.author_policy})",
        flush=True,
    )
    for doc in docs:
        print(
            f"- {doc['legacyBlogId']} -> {doc['_id']} author={doc['author']} "
            f"official={doc['isOfficial']} path={markdown_path(doc['legacyBlogId'])} "
            f"markdown_len={len(doc['markdown'])}",
            flush=True,
        )

    if dry_run:
        return

    print("Connecting to Mongo...", flush=True)
    client = ma.AsyncIOMotorClient(
        MONGO_HOST,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=2000,
        socketTimeoutMS=5000,
        directConnection=True,
    )
    db = client[MONGO_DB_NAME]
    try:
        await db.command("ping")
    except PyMongoError as exc:
        print(f"Mongo connection failed: {exc}", flush=True)
        return
    print("Mongo ping succeeded", flush=True)

    inserted = 0
    updated = 0
    for doc in docs:
        doc_id = doc["_id"]
        existing = await db.ublog_post.find_one({"_id": doc_id}, {"_id": 1})
        payload = {k: v for k, v in doc.items() if k != "_id"}
        await db.ublog_post.update_one({"_id": doc_id}, {"$set": payload}, upsert=True)
        if existing is None:
            inserted += 1
        else:
            updated += 1

    print(f"Applied migration: inserted={inserted}, updated={updated}", flush=True)


def main() -> None:
    args = parse_args()
    asyncio.run(migrate(args))


if __name__ == "__main__":
    main()
