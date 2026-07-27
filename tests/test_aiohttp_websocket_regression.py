import asyncio
import unittest
from typing import cast

from aiohttp._websocket.reader import WebSocketDataQueue, WebSocketReader
from aiohttp.base_protocol import BaseProtocol


class _Protocol:
    _reading_paused = False

    def pause_reading(self) -> None:
        self._reading_paused = True

    def resume_reading(self) -> None:
        self._reading_paused = False


class AiohttpWebSocketRegressionTestCase(unittest.TestCase):
    def test_compressed_data_is_accepted_after_initial_control_frame(self):
        loop = asyncio.new_event_loop()
        try:
            protocol = cast(BaseProtocol, _Protocol())
            queue = WebSocketDataQueue(protocol, 2**16, loop=loop)
            reader = WebSocketReader(queue, 4 * 1024**2, True, True)

            # A browser can answer the server heartbeat before sending any
            # application data. These are an empty PONG followed by an empty
            # permessage-deflate TEXT frame.
            self.assertEqual(reader.feed_data(b"\x8a\x00"), (False, b""))
            self.assertEqual(reader.feed_data(b"\xc1\x00"), (False, b""))
            self.assertIsNone(queue.exception())
        finally:
            loop.close()
