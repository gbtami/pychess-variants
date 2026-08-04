from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from scripts.manage_videos import (
    VideoMetadataError,
    create_video_document,
    extract_youtube_id,
    fetch_youtube_metadata,
    format_duration,
    upload_videos,
)


class ManageVideosTestCase(unittest.TestCase):
    def test_extracts_ids_from_supported_youtube_urls(self):
        video_id = "sTCEh3EMyu0"
        urls = (
            f"https://www.youtube.com/watch?v={video_id}&feature=shared",
            f"https://youtu.be/{video_id}?si=example",
            f"https://m.youtube.com/shorts/{video_id}",
            f"https://www.youtube-nocookie.com/embed/{video_id}",
            f"https://youtube.com/live/{video_id}",
        )
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(extract_youtube_id(url), video_id)

    def test_rejects_non_video_or_non_youtube_urls(self):
        for url in (
            "https://example.com/watch?v=sTCEh3EMyu0",
            "https://www.youtube.com/playlist?list=sTCEh3EMyu0",
            "sTCEh3EMyu0",
        ):
            with self.subTest(url=url), self.assertRaises(VideoMetadataError):
                extract_youtube_id(url)

    def test_formats_short_and_long_durations(self):
        self.assertEqual(format_duration(649), "10:49")
        self.assertEqual(format_duration(993), "16:33")
        self.assertEqual(format_duration(7875), "2:11:15")

    @patch("scripts.manage_videos._read_url")
    def test_fetches_title_author_and_duration(self, read_url):
        read_url.side_effect = [
            '{"title": "A title", "author_name": "A channel"}',
            'page data "lengthSeconds":"649" more data',
        ]

        self.assertEqual(
            fetch_youtube_metadata("sTCEh3EMyu0"),
            {
                "_id": "sTCEh3EMyu0",
                "title": "A title",
                "author": "A channel",
                "duration": "10:49",
            },
        )

    @patch("scripts.manage_videos.fetch_youtube_metadata")
    def test_creates_document_with_defaults(self, fetch_metadata):
        fetch_metadata.return_value = {
            "_id": "sTCEh3EMyu0",
            "title": "A title",
            "author": "A channel",
            "duration": "10:49",
        }

        document = create_video_document("https://youtu.be/sTCEh3EMyu0")

        self.assertEqual(
            document,
            {
                "_id": "sTCEh3EMyu0",
                "title": "A title",
                "author": "A channel",
                "tags": [],
                "category": "all",
                "target": "beginner",
                "duration": "10:49",
            },
        )

    @patch("scripts.manage_videos._read_url")
    def test_reports_missing_duration(self, read_url):
        read_url.side_effect = [
            '{"title": "A title", "author_name": "A channel"}',
            "page data without duration",
        ]

        with self.assertRaisesRegex(VideoMetadataError, "missing the video duration"):
            fetch_youtube_metadata("sTCEh3EMyu0")


class UploadVideosTestCase(unittest.IsolatedAsyncioTestCase):
    @patch("scripts.manage_videos.AsyncMongoClient")
    async def test_upserts_reviewed_document_from_videos(self, mongo_client_class):
        document = {
            "_id": "sTCEh3EMyu0",
            "title": "A title",
            "author": "A channel",
            "tags": [],
            "category": "all",
            "target": "beginner",
            "duration": "10:49",
        }
        collection = MagicMock()
        collection.update_one = AsyncMock(return_value=SimpleNamespace(upserted_id=document["_id"]))
        database = MagicMock()
        database.video = collection
        client = MagicMock()
        client.__getitem__.return_value = database
        client.close = AsyncMock()
        mongo_client_class.return_value = client

        with patch("scripts.manage_videos.VIDEOS", [document]):
            await upload_videos(
                [document["_id"]],
                mongo_host="mongodb://example",
                mongo_db="example-db",
            )

        collection.update_one.assert_awaited_once_with(
            {"_id": document["_id"]},
            {"$set": {key: value for key, value in document.items() if key != "_id"}},
            upsert=True,
        )
        client.close.assert_awaited_once_with()


if __name__ == "__main__":
    unittest.main()
