import unittest
from typing import cast
from unittest.mock import AsyncMock, patch

from aiohttp.web_ws import WebSocketResponse

from websocket_utils import ws_send_json, ws_send_str


class WebSocketUtilsTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_ws_send_json_connection_reset_returns_false_without_error_log(self):
        ws = cast(WebSocketResponse, AsyncMock())
        ws.send_json.side_effect = ConnectionResetError

        with patch("websocket_utils.log.error") as error:
            ok = await ws_send_json(ws, {"type": "ping"})

        self.assertFalse(ok)
        error.assert_not_called()

    async def test_ws_send_str_connection_reset_returns_false_without_error_log(self):
        ws = cast(WebSocketResponse, AsyncMock())
        ws.send_str.side_effect = ConnectionResetError

        with patch("websocket_utils.log.error") as error:
            ok = await ws_send_str(ws, "ping")

        self.assertFalse(ok)
        error.assert_not_called()
