from __future__ import annotations

import argparse
import asyncio
import json
import pprint
import re
from collections.abc import Sequence
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

from pymongo import AsyncMongoClient
from settings import MONGO_DB_NAME, MONGO_HOST
from videos import VIDEO_TAGS, VIDEO_TARGETS, VIDEOS

YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
LENGTH_SECONDS_RE = re.compile(r'"lengthSeconds":"(\d+)"')
YOUTUBE_HOSTS = {
    "m.youtube.com",
    "music.youtube.com",
    "www.youtube.com",
    "youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
VIDEO_CATEGORIES = ("all", "chess", "fairy", "army", "makruk", "shogi", "xiangqi", "other")
USER_AGENT = "Mozilla/5.0 (compatible; PyChess video metadata utility)"


class VideoMetadataError(RuntimeError):
    pass


def extract_youtube_id(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()

    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif host in YOUTUBE_HOSTS:
        path_parts = [part for part in parsed.path.split("/") if part]
        if parsed.path.rstrip("/") == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif len(path_parts) == 2 and path_parts[0] in {"embed", "live", "shorts"}:
            video_id = path_parts[1]
        else:
            video_id = ""
    else:
        video_id = ""

    if not YOUTUBE_ID_RE.fullmatch(video_id):
        raise VideoMetadataError(f"Not a supported YouTube video URL: {url}")
    return video_id


def format_duration(total_seconds: int) -> str:
    if total_seconds < 0:
        raise ValueError("duration cannot be negative")
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _read_url(url: str, *, timeout: float) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as exc:
        raise VideoMetadataError(f"Unable to fetch YouTube metadata: {exc}") from exc


def fetch_youtube_metadata(video_id: str, *, timeout: float = 20.0) -> dict[str, str]:
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    oembed_url = "https://www.youtube.com/oembed?" + urlencode({"url": watch_url, "format": "json"})

    try:
        oembed = json.loads(_read_url(oembed_url, timeout=timeout))
    except json.JSONDecodeError as exc:
        raise VideoMetadataError("YouTube returned invalid oEmbed metadata") from exc

    title = oembed.get("title")
    author = oembed.get("author_name")
    if not isinstance(title, str) or not title or not isinstance(author, str) or not author:
        raise VideoMetadataError("YouTube oEmbed metadata is missing the title or author")

    watch_page = _read_url(watch_url, timeout=timeout)
    duration_match = LENGTH_SECONDS_RE.search(watch_page)
    if duration_match is None:
        raise VideoMetadataError("YouTube watch metadata is missing the video duration")

    return {
        "_id": video_id,
        "title": title,
        "author": author,
        "duration": format_duration(int(duration_match.group(1))),
    }


def create_video_document(
    url: str,
    *,
    tags: Sequence[str] = (),
    categories: Sequence[str] = ("all",),
    target: str = "beginner",
    timeout: float = 20.0,
) -> dict[str, object]:
    metadata = fetch_youtube_metadata(extract_youtube_id(url), timeout=timeout)
    category: str | list[str]
    if len(categories) == 1:
        category = categories[0]
    else:
        category = list(categories)
    return {
        "_id": metadata["_id"],
        "title": metadata["title"],
        "author": metadata["author"],
        "tags": list(tags),
        "category": category,
        "target": target,
        "duration": metadata["duration"],
    }


def find_video_document(video_id: str) -> dict[str, Any]:
    for document in VIDEOS:
        if document.get("_id") == video_id:
            return document
    raise VideoMetadataError(f"Video {video_id!r} is not present in server/videos.py")


async def upload_videos(
    video_ids: Sequence[str],
    *,
    mongo_host: str,
    mongo_db: str,
) -> None:
    documents = [find_video_document(video_id) for video_id in video_ids]
    client = AsyncMongoClient(mongo_host, tz_aware=True)
    try:
        collection = client[mongo_db].video
        for document in documents:
            video_id = document["_id"]
            fields = {key: value for key, value in document.items() if key != "_id"}
            result = await collection.update_one(
                {"_id": video_id},
                {"$set": fields},
                upsert=True,
            )
            action = "inserted" if result.upserted_id is not None else "updated"
            print(f"{action}: {video_id}")
    finally:
        await client.close()


def _parse_upload(value: str) -> str | None:
    if not value.startswith("upload="):
        return None
    video_id = value.removeprefix("upload=")
    if not YOUTUBE_ID_RE.fullmatch(video_id):
        raise VideoMetadataError(f"Invalid YouTube video ID in {value!r}")
    return video_id


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create server/videos.py documents from YouTube URLs, or upload reviewed "
            "documents with upload=VIDEO_ID. Run with PYTHONPATH=server."
        )
    )
    parser.add_argument("items", nargs="+", metavar="URL|upload=VIDEO_ID")
    parser.add_argument(
        "--tag",
        action="append",
        choices=tuple(VIDEO_TAGS),
        default=[],
        help="Video tag; repeat for multiple tags (default: none)",
    )
    parser.add_argument(
        "--category",
        action="append",
        choices=VIDEO_CATEGORIES,
        help="Game category; repeat for multiple categories (default: all)",
    )
    parser.add_argument(
        "--target",
        choices=tuple(VIDEO_TARGETS),
        default="beginner",
        help="Intended audience (default: beginner)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="YouTube request timeout in seconds (default: 20)",
    )
    parser.add_argument(
        "--mongo-host",
        default=MONGO_HOST,
        help="Mongo connection URI for uploads (defaults to settings.MONGO_HOST)",
    )
    parser.add_argument(
        "--mongo-db",
        default=MONGO_DB_NAME,
        help="Mongo database name for uploads (defaults to settings.MONGO_DB_NAME)",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    try:
        upload_ids = [_parse_upload(item) for item in args.items]
    except VideoMetadataError as exc:
        parser.error(str(exc))

    is_upload = [video_id is not None for video_id in upload_ids]
    if any(is_upload) and not all(is_upload):
        parser.error("YouTube URLs and upload=VIDEO_ID arguments cannot be mixed")

    try:
        if all(is_upload):
            asyncio.run(
                upload_videos(
                    [video_id for video_id in upload_ids if video_id is not None],
                    mongo_host=args.mongo_host,
                    mongo_db=args.mongo_db,
                )
            )
            return

        categories = args.category or ["all"]
        for item in args.items:
            document = create_video_document(
                item,
                tags=args.tag,
                categories=categories,
                target=args.target,
                timeout=args.timeout,
            )
            print(pprint.pformat(document, sort_dicts=False, width=100) + ",")
    except VideoMetadataError as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
