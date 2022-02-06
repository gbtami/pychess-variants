from streamers import YOUTUBE_STREAMERS


class Youtube:
    def __init__(self, app):
        self.app = app
        self.streams = {}

    @property
    def live_streams(self):
#        return [self.streams[streamer] for streamer in self.streams if "pychess" in self.streams[streamer]["title"].lower()]
        return [self.streams[streamer] for streamer in self.streams]

    def add(self, channel, username="unknown", title="PyChess stream"):
        self.streams[channel] = {
            "username": YOUTUBE_STREAMERS.get(channel, username),
            "streamer": channel,
            "site": "youtube",
            "title": title,
        }

    def remove(self, channel):
        if channel in self.streams:
            del self.streams[channel]
