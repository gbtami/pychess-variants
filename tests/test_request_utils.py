import unittest
from typing import cast
from unittest.mock import AsyncMock

from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionResetError

from request_utils import read_json_data, read_post_data, read_text_data


class RequestUtilsTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_read_post_data_returns_none_on_client_disconnect(self):
        request = cast(web.Request, AsyncMock())
        request.post = AsyncMock(side_effect=ClientConnectionResetError("closed"))

        self.assertIsNone(await read_post_data(request))

    async def test_read_json_data_returns_none_on_client_disconnect(self):
        request = cast(web.Request, AsyncMock())
        request.json = AsyncMock(side_effect=ConnectionResetError)

        self.assertIsNone(await read_json_data(request))

    async def test_read_text_data_returns_none_on_client_disconnect(self):
        request = cast(web.Request, AsyncMock())
        request.text = AsyncMock(side_effect=ClientConnectionResetError("closed"))

        self.assertIsNone(await read_text_data(request))


if __name__ == "__main__":
    unittest.main(verbosity=2)
