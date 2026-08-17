import json
import time
from unittest.mock import patch

from aiohttp.test_utils import AioHTTPTestCase
from const import FOLLOW, GAME_CATEGORY_ALL
from forum.captcha import (
    _forum_captcha_challenge,
    _forum_captcha_payload,
    _refresh_forum_captcha_pool,
)
from forum.constants import ERASED_POST_TEXT, ERASED_POST_USER
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from team import PERMISSION_MODERATION
from user import User

from server import make_app


class ForumApiTestCase(AioHTTPTestCase):
    """Integration coverage for forum APIs added in the lichess-parity feature."""

    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies(
            {"AIOHTTP_SESSION": json.dumps(session_data)},
            response_url=self.client.make_url("/"),
        )

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

    async def create_team_with_forum(self, forum_access: str = "members") -> str:
        self.set_session_user("alice")
        response = await self.client.post(
            "/team/new",
            data={
                "name": "Variant Fans",
                "intro": "Play variants together",
                "description": "A friendly team for people who enjoy chess variants together.",
                "forumAccess": forum_access,
            },
            allow_redirects=False,
        )
        self.assertEqual(302, response.status)
        self.assertEqual("/team/variant-fans", response.headers["Location"])
        team_page = await self.client.get("/team/variant-fans")
        self.assertEqual(200, team_page.status)
        return "team-variant-fans"

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

    async def test_topic_exposes_timeline_unsubscribe_only_after_delivery(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")
        await app_state.db.relation.insert_one(
            {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW}
        )

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha(
            {"name": "timeline topic", "text": "initial post"}
        )
        create_response = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )
        create_payload = await create_response.json()
        topic_id = create_payload["topic"]["_id"]
        slug = create_payload["topic"]["slug"]

        self.set_session_user("bob")
        topic_response = await self.client.get(f"/api/forum/general-chess-discussion/{slug}")
        self.assertEqual(False, (await topic_response.json())["timelineUnsubscribed"])

        unsubscribe = await self.client.post(
            "/api/timeline/unsubscribe",
            data={"channel": f"forum:{topic_id}", "unsubscribed": "true"},
        )
        self.assertEqual(200, unsubscribe.status)
        muted_topic = await self.client.get(f"/api/forum/general-chess-discussion/{slug}")
        self.assertEqual(True, (await muted_topic.json())["timelineUnsubscribed"])

    async def test_forum_mention_does_not_cache_offline_recipient(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        await app_state.db.user.insert_one({"_id": "bob", "title": "FM", "enabled": True})

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha(
            {"name": "offline mention", "text": "hello @bob"}
        )
        response = await self.client.post(
            "/api/forum/general-chess-discussion/topic",
            data=create_data,
        )

        self.assertEqual(response.status, 200)
        self.assertNotIn("bob", app_state.users.data)
        self.assertIsNotNone(
            await app_state.db.notify.find_one({"notifies": "bob", "type": "forumMention"})
        )

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

    async def test_team_forum_members_and_everyone_access(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")
        self.add_user("charlie")
        categ_id = await self.create_team_with_forum("members")

        index_response = await self.client.get("/api/forum/categs")
        index_payload = await index_response.json()
        self.assertIn(categ_id, {categ["_id"] for categ in index_payload["categs"]})

        self.set_session_user("charlie")
        outsider_index = await self.client.get("/api/forum/categs")
        self.assertNotIn(
            categ_id, {categ["_id"] for categ in (await outsider_index.json())["categs"]}
        )
        denied_page = await self.client.get(f"/forum/{categ_id}")
        self.assertEqual(403, denied_page.status)
        denied = await self.client.get(f"/api/forum/{categ_id}/topics")
        self.assertEqual(403, denied.status)

        self.set_session_user("bob")
        joined = await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.assertEqual(302, joined.status)
        member_view = await self.client.get(f"/api/forum/{categ_id}/topics")
        self.assertEqual(200, member_view.status)
        member_page = await self.client.get(f"/forum/{categ_id}")
        self.assertEqual(200, member_page.status)
        member_payload = await member_view.json()
        self.assertTrue(member_payload["canWrite"])
        self.assertEqual("variant-fans", member_payload["categ"]["teamId"])
        self.assertEqual(1, member_payload["total"])

        self.set_session_user("alice")
        edited = await self.client.post(
            "/team/variant-fans/edit",
            data={
                "intro": "Play variants together",
                "description": "A friendly team for people who enjoy chess variants together.",
                "forumAccess": "everyone",
            },
            allow_redirects=False,
        )
        self.assertEqual(302, edited.status)
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertEqual("everyone", team["forumAccess"])

        self.set_session_user("charlie")
        public_view = await self.client.get(f"/api/forum/{categ_id}/topics")
        self.assertEqual(200, public_view.status)
        public_payload = await public_view.json()
        self.assertFalse(public_payload["canWrite"])
        public_index = await self.client.get("/api/forum/categs")
        self.assertNotIn(
            categ_id, {categ["_id"] for categ in (await public_index.json())["categs"]}
        )
        create_data = await self.with_forum_captcha(
            {"name": "outsider topic", "text": "outsiders still cannot post"}
        )
        outsider_post = await self.client.post(f"/api/forum/{categ_id}/topic", data=create_data)
        self.assertEqual("error", (await outsider_post.json()).get("type"))

    async def test_team_forum_leader_access_and_moderation(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")
        categ_id = await self.create_team_with_forum("leaders")

        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        denied = await self.client.get(f"/api/forum/{categ_id}/topics")
        self.assertEqual(403, denied.status)

        await app_state.db.team_member.update_one(
            {"_id": "bob@variant-fans"},
            {"$set": {"permissions": [PERMISSION_MODERATION]}},
        )
        leader_view = await self.client.get(f"/api/forum/{categ_id}/topics")
        self.assertEqual(200, leader_view.status)
        payload = await leader_view.json()
        self.assertTrue(payload["canWrite"])
        self.assertTrue(payload["canModerate"])
        welcome = payload["topics"][0]

        sticky = await self.client.post(f"/api/forum/{categ_id}/{welcome['slug']}/sticky")
        self.assertTrue((await sticky.json()).get("sticky"))
        mod_feed = await self.client.get(f"/api/forum/{categ_id}/mod-feed")
        self.assertEqual(200, mod_feed.status)
        self.assertEqual(1, (await mod_feed.json())["total"])

    async def test_team_forum_privacy_covers_mentions_search_redirects_and_timeline(self):
        app_state = get_app_state(self.app)
        self.add_user("alice")
        self.add_user("bob")
        self.add_user("charlie")
        categ_id = await self.create_team_with_forum("members")

        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        await app_state.db.relation.insert_many(
            [
                {"_id": "bob/alice", "u1": "bob", "u2": "alice", "r": FOLLOW},
                {"_id": "charlie/alice", "u1": "charlie", "u2": "alice", "r": FOLLOW},
            ]
        )

        self.set_session_user("alice")
        create_data = await self.with_forum_captcha(
            {
                "name": "private plans",
                "text": "secret-team-phrase hello @bob and @charlie",
            }
        )
        created = await self.client.post(f"/api/forum/{categ_id}/topic", data=create_data)
        created_payload = await created.json()
        self.assertTrue(created_payload.get("ok"), created_payload)
        topic_id = created_payload["topic"]["_id"]
        post_id = created_payload["topic"]["lastPostId"]

        self.assertIsNotNone(
            await app_state.db.notify.find_one(
                {"notifies": "bob", "type": "forumMention", "content.id": post_id}
            )
        )
        self.assertIsNone(
            await app_state.db.notify.find_one(
                {"notifies": "charlie", "type": "forumMention", "content.id": post_id}
            )
        )
        timeline = await app_state.db.timeline_entry.find_one({"data.postId": post_id})
        self.assertIsNotNone(timeline)
        self.assertIn("bob", timeline["users"])
        self.assertNotIn("charlie", timeline["users"])

        self.set_session_user("bob")
        before_leave = await self.client.get("/api/timeline?nb=30")
        before_entries = (await before_leave.json())["entries"]
        self.assertIn(post_id, {entry["data"].get("postId") for entry in before_entries})
        left = await self.client.post("/team/variant-fans/quit", allow_redirects=False)
        self.assertEqual(302, left.status)
        after_leave = await self.client.get("/api/timeline?nb=30")
        after_entries = (await after_leave.json())["entries"]
        self.assertNotIn(post_id, {entry["data"].get("postId") for entry in after_entries})

        self.set_session_user("alice")
        search = await self.client.get("/api/forum/search?text=secret-team-phrase")
        self.assertEqual(0, (await search.json())["total"])

        self.set_session_user("charlie")
        redirect = await self.client.get(f"/forum/redirect/post/{post_id}", allow_redirects=False)
        self.assertEqual(302, redirect.status)
        self.assertEqual("/forum", redirect.headers["Location"])
        participants = await self.client.get(f"/api/forum/participants/{topic_id}")
        self.assertEqual(403, participants.status)

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
