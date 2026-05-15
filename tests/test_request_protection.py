import unittest
from types import SimpleNamespace

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app


class RequestProtectionTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

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

    async def test_inbox_threads_route_is_not_in_profile_rate_limit_bucket(self):
        statuses: list[int] = []

        for _ in range(45):
            resp = await self.client.request("GET", "/api/inbox/threads")
            statuses.append(resp.status)

        self.assertNotIn(429, statuses)

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

    async def test_stale_invite_id_does_not_return_server_error(self):
        game_id = "8FEG1Sxq"
        app_state = get_app_state(self.app)
        app_state.invites[game_id] = SimpleNamespace(id="missing_seek")

        resp = await self.client.request("GET", f"/invite/{game_id}")
        self.assertNotEqual(resp.status, 500)

    async def test_cancel_invite_with_stale_seek_redirects_without_server_error(self):
        game_id = "BQ4PCvAl"
        app_state = get_app_state(self.app)
        app_state.invites[game_id] = SimpleNamespace(id="missing_seek")

        resp = await self.client.request("POST", f"/invite/cancel/{game_id}", allow_redirects=False)
        self.assertEqual(resp.status, 302)
        self.assertEqual(resp.headers["Location"], "/")
        self.assertNotIn(game_id, app_state.invites)

    async def test_missing_invite_id_shows_expired_invite_state(self):
        game_id = "AbCd1234"
        resp = await self.client.request("GET", f"/invite/{game_id}")
        self.assertEqual(resp.status, 200)
        html = await resp.text()
        self.assertIn('data-inviter="expired"', html)

    async def test_missing_invite_accept_shows_expired_invite_state(self):
        game_id = "QwEr5678"
        resp = await self.client.request("POST", f"/invite/accept/{game_id}")
        self.assertEqual(resp.status, 200)
        html = await resp.text()
        self.assertIn('data-inviter="expired"', html)

    async def test_video_tags_are_url_encoded_in_html(self):
        resp = await self.client.request("GET", "/video")
        self.assertEqual(resp.status, 200)
        html = await resp.text()
        self.assertIn("/video?tags=Hu%20Ronghua", html)
        self.assertNotIn('/video?tags=Hu Ronghua"', html)

    async def test_translation_select_rejects_foreign_referer_redirect(self):
        resp = await self.client.request(
            "POST",
            "/translation/select",
            data={"lang": "hu"},
            headers={"REFERER": "https://evil.example/phish"},
            allow_redirects=False,
        )
        self.assertEqual(resp.status, 302)
        self.assertEqual(resp.headers["Location"], "/")

    async def test_game_category_rejects_protocol_relative_referer_redirect(self):
        resp = await self.client.request(
            "POST",
            "/pref/game-category",
            data={"game_category": "chess"},
            headers={"REFERER": "//evil.example/phish"},
            allow_redirects=False,
        )
        self.assertEqual(resp.status, 302)
        self.assertEqual(resp.headers["Location"], "/")

    async def test_names_autocomplete_escapes_regex_metacharacters(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_many(
            [
                {"_id": "AlphaBeta", "title": "GM"},
                {"_id": "alpha_one", "title": ""},
                {"_id": "alpine", "title": "IM"},
            ]
        )

        response = await self.client.get("/api/names?p=alph")
        self.assertEqual(response.status, 200)
        self.assertEqual(
            await response.json(),
            [["AlphaBeta", "GM"], ["alpha_one", ""]],
        )

        response = await self.client.get("/api/names?p=alph%5C")
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.json(), [])

    async def test_user_status_requires_ids(self):
        response = await self.client.get("/api/users/status")

        self.assertEqual(response.status, 400)


if __name__ == "__main__":
    unittest.main()
