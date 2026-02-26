import unittest
from typing import cast
from unittest.mock import AsyncMock, patch

from aiohttp.web_ws import WebSocketResponse

from websocket_utils import ws_send_json, ws_send_json_many, ws_send_str, ws_send_str_many


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

    async def test_ws_send_json_many_returns_count_of_successful_sends(self):
        ws1 = cast(WebSocketResponse, AsyncMock())
        ws2 = cast(WebSocketResponse, AsyncMock())
        ws2.send_str.side_effect = ConnectionResetError

        sent = await ws_send_json_many([ws1, ws2], {"type": "ping"})

        self.assertEqual(sent, 1)
        ws1.send_str.assert_awaited_once_with('{"type": "ping"}')
        ws2.send_str.assert_awaited_once_with('{"type": "ping"}')

    async def test_ws_send_str_many_logs_when_none_socket_present(self):
        ws = cast(WebSocketResponse, AsyncMock())

        with patch("websocket_utils.log.error") as error:
            sent = await ws_send_str_many([None, ws], "ping")

        self.assertEqual(sent, 1)
        ws.send_str.assert_awaited_once_with("ping")
        error.assert_called_once_with("ws_send_str_many: ws is None")
