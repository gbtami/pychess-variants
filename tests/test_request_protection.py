import unittest

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from server import make_app


class RequestProtectionTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient())

    async def tearDownAsync(self):
        await self.client.close()

    async def test_known_scanner_path_returns_not_found(self):
        resp = await self.client.request("GET", "/wp-content/plugins/hellopress/wp_filemanager")
        self.assertEqual(resp.status, 404)

    async def test_profile_route_is_rate_limited(self):
        statuses: list[int] = []

        # The limiter budget for /@/ routes is intentionally finite per IP.
        # We hit an unknown profile repeatedly to ensure the middleware emits 429
        # before this turns into unbounded DB miss traffic.
        for _ in range(45):
            resp = await self.client.request("GET", "/@/NoSuchUserRateLimitProbe")
            statuses.append(resp.status)

        # Before rate limit kicks in, this path goes through the normal handler
        # and the app's existing 404 page middleware renders a 200 response.
        self.assertIn(200, statuses)
        self.assertIn(429, statuses)

    async def test_unknown_blog_id_does_not_return_server_error(self):
        resp = await self.client.request("GET", "/blogs/null")
        self.assertNotEqual(resp.status, 500)

    async def test_known_variant_without_doc_does_not_return_server_error(self):
        for variant in ("makbug", "supply"):
            resp = await self.client.request("GET", f"/variants/{variant}")
            self.assertNotEqual(resp.status, 500)

    async def test_unknown_round_socket_game_returns_not_found(self):
        resp = await self.client.request("GET", "/wsr/AAAAAAAA")
        self.assertEqual(resp.status, 404)


if __name__ == "__main__":
    unittest.main()
