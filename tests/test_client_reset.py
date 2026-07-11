import unittest
from typing import cast

from aiohttp import web

from client_reset import client_reset, client_reset_page


class ClientResetTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_confirmation_page_does_not_clear_data(self) -> None:
        request = cast(web.Request, object())

        response = await client_reset_page(request)

        body = response.text or ""

        self.assertEqual(response.status, 200)
        self.assertNotIn("Clear-Site-Data", response.headers)
        self.assertNotIn("Set-Cookie", response.headers)
        self.assertIn('method="post"', body)
        self.assertIn("login cookie is not cleared", body)
        self.assertEqual(
            response.headers["Cache-Control"],
            "no-store, no-cache, must-revalidate",
        )

    async def test_reset_clears_cache_and_storage_but_not_cookies(self) -> None:
        request = cast(web.Request, object())

        response = await client_reset(request)

        body = response.text or ""

        self.assertEqual(response.status, 200)
        self.assertEqual(
            response.headers["Clear-Site-Data"],
            '"cache", "storage"',
        )
        self.assertNotIn('"cookies"', response.headers["Clear-Site-Data"])
        self.assertNotIn("Set-Cookie", response.headers)
        self.assertIn("Reset complete", body)
        self.assertIn("was preserved", body)
