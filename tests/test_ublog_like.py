import json
import time

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class UblogLikeTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.clear()
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def add_user(self, username: str) -> None:
        app_state = get_app_state(self.app)
        app_state.users[username] = User(app_state, username=username)
        await app_state.db.user.insert_one(
            {
                "_id": username,
                "username_lower": username.casefold(),
                "enabled": True,
            }
        )

    async def add_post(self, likes: list[str] | None = None) -> None:
        app_state = get_app_state(self.app)
        await app_state.db.ublog_post.insert_one(
            {
                "_id": "post0001",
                "author": "author",
                "title": "Post",
                "slug": "post",
                "live": True,
                "likes": likes or [],
            }
        )

    async def like(self):
        return await self.client.post(
            "/blogs/@/author/post0001/like",
            headers={
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            },
        )

    async def test_one_user_cannot_add_more_than_one_like(self):
        await self.add_user("alice")
        await self.add_post()
        self.set_session_user("alice")

        first = await self.like()
        self.assertEqual(first.status, 200)
        self.assertEqual(await first.json(), {"ok": True, "liked": True, "likes": 1})

        second = await self.like()
        self.assertEqual(second.status, 200)
        self.assertEqual(await second.json(), {"ok": True, "liked": False, "likes": 0})

        third = await self.like()
        self.assertEqual(third.status, 200)
        self.assertEqual(await third.json(), {"ok": True, "liked": True, "likes": 1})

        app_state = get_app_state(self.app)
        post = await app_state.db.ublog_post.find_one({"_id": "post0001"})
        self.assertEqual(post["likes"], ["alice"])

    async def test_legacy_duplicate_usernames_count_as_one_like(self):
        await self.add_user("alice")
        await self.add_post(["alice", "alice"])
        self.set_session_user("alice")

        response = await self.like()
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.json(), {"ok": True, "liked": False, "likes": 0})

        app_state = get_app_state(self.app)
        post = await app_state.db.ublog_post.find_one({"_id": "post0001"})
        self.assertEqual(post["likes"], [])

    async def test_likes_are_counted_per_user(self):
        await self.add_user("alice")
        await self.add_user("bob")
        await self.add_post()

        self.set_session_user("alice")
        alice_response = await self.like()
        self.assertEqual((await alice_response.json())["likes"], 1)

        self.set_session_user("bob")
        bob_response = await self.like()
        self.assertEqual((await bob_response.json())["likes"], 2)

        app_state = get_app_state(self.app)
        post = await app_state.db.ublog_post.find_one({"_id": "post0001"})
        self.assertEqual(set(post["likes"]), {"alice", "bob"})
