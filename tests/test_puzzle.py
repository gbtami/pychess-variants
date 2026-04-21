import unittest
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch

from aiohttp import web

import puzzle


class PuzzleRequestHandlingTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_read_puzzle_post_connection_reset_returns_none(self):
        request = cast(web.Request, AsyncMock())
        request.post = AsyncMock(side_effect=ConnectionResetError)

        data = await puzzle._read_puzzle_post(request)

        self.assertIsNone(data)

    async def test_puzzle_complete_connection_reset_returns_empty_json(self):
        request = cast(web.Request, AsyncMock())
        request.app = {}
        request.match_info = {"puzzleId": "puzzle1"}
        request.post = AsyncMock(side_effect=ConnectionResetError)

        with patch("puzzle.get_app_state", return_value=SimpleNamespace()):
            response = await puzzle.puzzle_complete(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(response.text, "{}")

    async def test_puzzle_vote_connection_reset_returns_empty_json(self):
        request = cast(web.Request, AsyncMock())
        request.app = {}
        request.match_info = {"puzzleId": "puzzle1"}
        request.post = AsyncMock(side_effect=ConnectionResetError)

        with patch("puzzle.get_app_state", return_value=SimpleNamespace()):
            response = await puzzle.puzzle_vote(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(response.text, "{}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
