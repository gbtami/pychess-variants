from typing import ClassVar
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from oauth_config import oauth_config

from server import make_app


class FakeTokenResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    async def json(self):
        return {"access_token": "test-access-token"}


class FakeClientSession:
    requests: ClassVar[list[dict[str, str]]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    def post(self, _url, *, data, headers):
        self.requests.append(data)
        return FakeTokenResponse()


class LoginRouteTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    async def asyncSetUp(self):
        await super().asyncSetUp()
        FakeClientSession.requests.clear()
        self.client_secret = "fake-client-secret"
        self.oauth_config_patch = patch.dict(
            oauth_config["discord"], {"client_secret": self.client_secret}
        )
        self.oauth_config_patch.start()

    async def asyncTearDown(self):
        self.oauth_config_patch.stop()
        await super().asyncTearDown()

    async def start_discord_oauth(self):
        response = await self.client.get("/oauth/discord", allow_redirects=False)
        self.assertEqual(response.status, 302)
        location = response.headers["Location"]
        state = parse_qs(urlparse(location).query)["state"][0]
        return location, state

    async def finish_discord_oauth(self, state: str, code: str):
        query = urlencode({"state": state, "code": code})
        return await self.client.get(f"/oauth/discord?{query}", allow_redirects=False)

    async def test_provider_neutral_login_opens_provider_chooser(self):
        response = await self.client.get("/login", allow_redirects=False)

        self.assertEqual(response.status, 302)
        self.assertEqual(response.headers.get("Location"), "/#login")

    async def test_oauth_state_is_random_and_does_not_expose_client_secret(self):
        first_location, first_state = await self.start_discord_oauth()
        second_location, second_state = await self.start_discord_oauth()

        self.assertNotEqual(first_state, second_state)
        self.assertNotIn(self.client_secret, first_location)
        self.assertNotIn(self.client_secret, second_location)

    async def test_oauth_flows_support_concurrent_logins_and_reject_replay(self):
        _, first_state = await self.start_discord_oauth()
        _, second_state = await self.start_discord_oauth()

        with patch("login.aiohttp.ClientSession", FakeClientSession):
            first_response = await self.finish_discord_oauth(first_state, "first-code")
            replay_response = await self.finish_discord_oauth(first_state, "replayed-code")
            second_response = await self.finish_discord_oauth(second_state, "second-code")

        self.assertEqual(first_response.headers.get("Location"), "/login/discord")
        self.assertEqual(replay_response.headers.get("Location"), "/")
        self.assertEqual(second_response.headers.get("Location"), "/login/discord")
        self.assertEqual(len(FakeClientSession.requests), 2)
        self.assertEqual(
            [request["code"] for request in FakeClientSession.requests],
            ["first-code", "second-code"],
        )
        self.assertNotEqual(
            FakeClientSession.requests[0]["code_verifier"],
            FakeClientSession.requests[1]["code_verifier"],
        )
        self.assertTrue(
            all(
                request["client_secret"] == self.client_secret
                for request in FakeClientSession.requests
            )
        )
