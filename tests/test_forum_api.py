import json
import time
from unittest.mock import patch

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import GAME_CATEGORY_ALL
from forum.constants import ERASED_POST_TEXT, ERASED_POST_USER
from forum.captcha import (
    _forum_captcha_challenge,
    _forum_captcha_payload,
    _refresh_forum_captcha_pool,
)
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User


class ForumApiTestCase(AioHTTPTestCase):
    """Integration coverage for forum APIs added in the lichess-parity feature."""

    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    def add_user(self, username: str, *, title: str = "FM") -> User:
        app_state = get_app_state(self.app)
        user = User(app_state, username=username, title=title)
        app_state.users[user.username] = user
        return user

    async def with_forum_captcha(self, data: dict[str, str]) -> dict[str, str]:
        captcha_resp = await self.client.get("/api/forum/captcha")
        self.assertEqual(captcha_resp.status, 200)
        captcha_payload = await captcha_resp.json()
        captcha = captcha_payload.get("captcha", {})
        game_id = str(captcha.get("gameId", ""))
        challenge = _forum_captcha_challenge(game_id)
        solutions = challenge.get("solutions")
        self.assertIsInstance(solutions, tuple)
        self.assertGreater(len(solutions), 0)

        payload = dict(data)
        payload["gameId"] = game_id
        payload["move"] = str(solutions[0])
        return payload

    async def test_forum_topic_reply_mentions_and_participants(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha({"name": "hello forum", "text": "hello @bob"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        self.assertEqual(create_resp.status, 200)
        create_payload = await create_resp.json()
        self.assertTrue(create_payload.get("ok"))
        topic_id = create_payload["topic"]["_id"]
        slug = create_payload["topic"]["slug"]

        bob_notif = await app_state.db.notify.find_one({"notifies": "bob", "type": "forumMention"})
        self.assertIsNotNone(bob_notif)
        self.assertEqual("alice", bob_notif["content"]["opp"])
        self.assertEqual("general-chess-discussion", bob_notif["content"]["categ"])
        self.assertEqual(slug, bob_notif["content"]["slug"])

        self.set_session_user("bob")
        participants_resp = await self.client.get(f"/api/forum/participants/{topic_id}")
        self.assertEqual(participants_resp.status, 200)
        participants_payload = await participants_resp.json()
        self.assertEqual(["alice"], participants_payload["participants"])

        reply_data = await self.with_forum_captcha({"text": "hi @alice"})
        reply_resp = await self.client.post(
            f"/api/forum/general-chess-discussion/{slug}/post",
            data=reply_data,
        )
        self.assertEqual(reply_resp.status, 200)
        reply_payload = await reply_resp.json()
        self.assertTrue(reply_payload.get("ok"))

        alice_notif = await app_state.db.notify.find_one(
            {"notifies": "alice", "type": "forumMention"}
        )
        self.assertIsNotNone(alice_notif)
        self.assertEqual("bob", alice_notif["content"]["opp"])

        participants_resp2 = await self.client.get(f"/api/forum/participants/{topic_id}")
        participants_payload2 = await participants_resp2.json()
        self.assertEqual(["alice", "bob"], participants_payload2["participants"])

    async def test_forum_reactions(self):
        self.add_user("alice")
        self.add_user("bob")

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha({"name": "reactable", "text": "first post"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        create_payload = await create_resp.json()
        post_id = create_payload["topic"]["lastPostId"]

        self.set_session_user("bob")
        react_add = await self.client.post(
            f"/api/forum/general-chess-discussion/react/{post_id}/%2B1/true"
        )
        self.assertEqual(react_add.status, 200)
        add_payload = await react_add.json()
        self.assertTrue(add_payload.get("ok"))
        self.assertEqual(1, add_payload["reactionCounts"].get("+1"))
        self.assertIn("+1", add_payload.get("myReactions", []))

        react_remove = await self.client.post(
            f"/api/forum/general-chess-discussion/react/{post_id}/%2B1/false"
        )
        self.assertEqual(react_remove.status, 200)
        remove_payload = await react_remove.json()
        self.assertTrue(remove_payload.get("ok"))
        self.assertNotIn("+1", remove_payload.get("reactionCounts", {}))

        self.set_session_user("alice")
        react_self = await self.client.post(
            f"/api/forum/general-chess-discussion/react/{post_id}/heart/true"
        )
        self.assertEqual(react_self.status, 200)
        self.assertEqual("error", (await react_self.json()).get("type"))

    async def test_forum_mod_feed_and_relocate(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("mod")

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha({"name": "move me", "text": "initial post"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        create_payload = await create_resp.json()
        post_id = create_payload["topic"]["lastPostId"]
        topic_id = create_payload["topic"]["_id"]

        self.set_session_user("mod")
        with patch("forum.permissions.is_admin", side_effect=lambda username: username == "mod"):
            mod_feed = await self.client.get("/api/forum/general-chess-discussion/mod-feed")
            self.assertEqual(mod_feed.status, 200)
            mod_payload = await mod_feed.json()
            self.assertEqual(1, mod_payload["total"])
            self.assertEqual(1, len(mod_payload["items"]))

            relocate_resp = await self.client.post(
                f"/api/forum/post/{post_id}/relocate",
                data={"categ": "game-analysis"},
            )
            self.assertEqual(relocate_resp.status, 200)
            relocate_payload = await relocate_resp.json()
            self.assertTrue(relocate_payload.get("ok"))
            self.assertIn("/forum/game-analysis/", relocate_payload.get("redirect", ""))

        moved_topic = await app_state.db.forum_topic.find_one({"_id": topic_id})
        self.assertEqual("game-analysis", moved_topic["categId"])
        moved_posts = await app_state.db.forum_post.count_documents(
            {"topicId": topic_id, "categId": "game-analysis"}
        )
        self.assertEqual(1, moved_posts)

    async def test_forum_owner_delete_erases_post_and_keeps_topic(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha({"name": "erase me", "text": "original post"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        self.assertEqual(create_resp.status, 200)
        create_payload = await create_resp.json()
        self.assertTrue(create_payload.get("ok"))
        topic_id = create_payload["topic"]["_id"]
        slug = create_payload["topic"]["slug"]
        first_post_id = create_payload["topic"]["lastPostId"]

        self.set_session_user("bob")
        reply_data = await self.with_forum_captcha({"text": "reply here"})
        reply_resp = await self.client.post(
            f"/api/forum/general-chess-discussion/{slug}/post",
            data=reply_data,
        )
        self.assertEqual(reply_resp.status, 200)
        self.assertTrue((await reply_resp.json()).get("ok"))

        self.set_session_user("alice")
        delete_resp = await self.client.post(f"/api/forum/post/{first_post_id}/delete")
        self.assertEqual(delete_resp.status, 200)
        delete_payload = await delete_resp.json()
        self.assertTrue(delete_payload.get("ok"))
        self.assertTrue(delete_payload.get("erased"))

        kept_topic = await app_state.db.forum_topic.find_one({"_id": topic_id})
        self.assertIsNotNone(kept_topic)
        self.assertEqual(2, kept_topic["nbPosts"])

        erased_post = await app_state.db.forum_post.find_one({"_id": first_post_id})
        self.assertIsNotNone(erased_post)
        self.assertEqual(ERASED_POST_USER, erased_post["user"])
        self.assertEqual(ERASED_POST_TEXT, erased_post["text"])
        self.assertIsNotNone(erased_post.get("erasedAt"))

        topic_view = await self.client.get(f"/api/forum/general-chess-discussion/{slug}")
        self.assertEqual(topic_view.status, 200)
        topic_payload = await topic_view.json()
        first_post_payload = topic_payload["posts"][0]
        self.assertEqual(ERASED_POST_USER, first_post_payload["user"])
        self.assertEqual(ERASED_POST_TEXT, first_post_payload["text"])
        self.assertFalse(first_post_payload.get("canEdit"))
        self.assertFalse(first_post_payload.get("canDelete"))
        self.assertFalse(first_post_payload.get("canReact"))

    async def test_forum_redirect_to_correct_page(self):
        app_state = get_app_state(self.app)
        app_state.chat_flood.allow_message = lambda source, text: True
        self.add_user("alice")
        self.add_user("bob")

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha({"name": "paged topic", "text": "post zero"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        self.assertEqual(create_resp.status, 200)
        create_payload = await create_resp.json()
        self.assertTrue(create_payload.get("ok"), create_payload)
        slug = create_payload["topic"]["slug"]

        target_post_id = ""
        for idx in range(1, 13):
            user = "alice" if idx % 2 else "bob"
            self.set_session_user(user)
            reply_data = await self.with_forum_captcha({"text": f"reply {idx}"})
            reply_resp = await self.client.post(
                f"/api/forum/general-chess-discussion/{slug}/post",
                data=reply_data,
            )
            self.assertEqual(reply_resp.status, 200)
            reply_payload = await reply_resp.json()
            self.assertTrue(reply_payload.get("ok"), reply_payload)
            if idx == 11:
                target_post_id = reply_payload["post"]["_id"]

        redirect_resp = await self.client.get(
            f"/forum/redirect/post/{target_post_id}", allow_redirects=False
        )
        self.assertEqual(302, redirect_resp.status)
        location = redirect_resp.headers.get("Location", "")
        self.assertIn("/forum/general-chess-discussion/", location)
        self.assertIn("?page=2", location)
        self.assertIn(f"#{target_post_id}", location)

    async def test_forum_topics_survive_captcha_refresh_failure(self):
        self.add_user("alice")
        self.set_session_user("alice")

        with patch("forum.captcha._refresh_forum_captcha_pool", side_effect=RuntimeError("boom")):
            resp = await self.client.get("/api/forum/general-chess-discussion/topics?page=1")

        self.assertEqual(resp.status, 200)
        payload = await resp.json()
        self.assertEqual("general-chess-discussion", payload["categ"]["_id"])
        self.assertTrue(payload["canWrite"])

    async def test_forum_topic_load_schedules_captcha_refresh_without_blocking(self):
        class _ScheduledTask:
            def add_done_callback(self, _callback):
                return None

            def done(self):
                return False

        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.set_session_user("alice")

        create_data = await self.with_forum_captcha({"name": "hello forum", "text": "first post"})
        create_resp = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        self.assertEqual(create_resp.status, 200)
        slug = (await create_resp.json())["topic"]["slug"]

        scheduled_names: list[str] = []

        def fake_create_background_task(coro, *, name: str):
            scheduled_names.append(name)
            coro.close()
            return _ScheduledTask()

        with (
            patch.dict("forum.captcha.FORUM_CAPTCHA_LAST_REFRESH", {}, clear=True),
            patch.dict("forum.captcha.FORUM_CAPTCHA_REFRESH_TASKS", {}, clear=True),
            patch.object(
                app_state, "create_background_task", side_effect=fake_create_background_task
            ),
        ):
            resp = await self.client.get(f"/api/forum/general-chess-discussion/{slug}")

        self.assertEqual(resp.status, 200)
        payload = await resp.json()
        self.assertEqual(slug, payload["topic"]["slug"])
        self.assertEqual(["forum-captcha-refresh-all"], scheduled_names)

    async def test_forum_captcha_refresh_awaits_aggregate_cursor(self):
        class _EmptyAsyncCursor:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

        class _AwaitableGameCollection:
            async def aggregate(self, _pipeline):
                return _EmptyAsyncCursor()

        class _DirectCursorGameCollection:
            def aggregate(self, _pipeline):
                return _EmptyAsyncCursor()

        class _Db:
            def __init__(self, game):
                self.game = game

        class _AppState:
            def __init__(self, game):
                self.db = _Db(game)

        await _refresh_forum_captcha_pool(_AppState(_AwaitableGameCollection()), GAME_CATEGORY_ALL)
        await _refresh_forum_captcha_pool(
            _AppState(_DirectCursorGameCollection()), GAME_CATEGORY_ALL
        )

    def test_forum_captcha_payload_includes_help_url_for_real_games_only(self):
        real_payload = _forum_captcha_payload(
            {
                "gameId": "AbCd1234",
                "variant": "chess",
                "fen": "8/8/8/8/8/8/8/8 w - - 0 1",
                "color": "white",
                "moves": {"a1": "a2"},
                "helpUrl": "/AbCd1234",
            }
        )
        self.assertEqual("/AbCd1234", real_payload.get("helpUrl"))

        fallback_payload = _forum_captcha_payload(
            {
                "gameId": "00000000",
                "variant": "chess",
                "fen": "8/8/8/8/8/8/8/8 w - - 0 1",
                "color": "white",
                "moves": {"a1": "a2"},
            }
        )
        self.assertNotIn("helpUrl", fallback_payload)


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)
