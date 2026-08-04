from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from server import make_app


class LoginRouteTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    async def test_provider_neutral_login_opens_provider_chooser(self):
        response = await self.client.get("/login", allow_redirects=False)

        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/#login")
