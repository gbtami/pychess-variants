from __future__ import annotations
from typing import Any

from streamers import YOUTUBE_STREAMERS


class Youtube:
    def __init__(self, app: Any) -> None:
        self.app: Any = app
        self.streams: dict[str, dict[str, str]] = {}

    @property
    def live_streams(self) -> list[dict[str, str]]:
        # return [self.streams[streamer] for streamer in self.streams if "pychess" in self.streams[streamer]["title"].lower()]
        return [self.streams[streamer] for streamer in self.streams]

    def add(self, channel: str, username: str = "unknown", title: str = "PyChess stream") -> None:
        self.streams[channel] = {
            "username": YOUTUBE_STREAMERS.get(channel, username),
            "streamer": channel,
            "site": "youtube",
            "title": title,
        }

    def remove(self, channel: str) -> None:
        if channel in self.streams:
            del self.streams[channel]
