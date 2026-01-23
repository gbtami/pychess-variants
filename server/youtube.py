from __future__ import annotations
from typing import TYPE_CHECKING

from streamers import YOUTUBE_STREAMERS

if TYPE_CHECKING:
    from aiohttp import web
    from typing_defs import StreamInfo


class Youtube:
    def __init__(self, app: web.Application) -> None:
        self.app: web.Application = app
        self.streams: dict[str, StreamInfo] = {}

    @property
    def live_streams(self) -> list[StreamInfo]:
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
