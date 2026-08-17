import json
import time
from datetime import UTC, datetime
from pathlib import Path

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from multidict import MultiDict
from pychess_global_app_state_utils import get_app_state
from team import (
    PERMISSION_ADMIN,
    PERMISSION_PUBLIC,
    PERMISSION_TOURNAMENTS,
    PERMISSION_UPDATES,
    TEAM_PERMISSIONS,
)
from tournament.auto_play_tournament import SwissTestTournament
from tournament.tournament import upsert_tournament_to_db
from user import User

from server import make_app


class TeamTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def add_live_user(self, username: str) -> None:
        app_state = get_app_state(self.app)
        app_state.users[username] = User(app_state, username=username)

    def set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies(
            {"AIOHTTP_SESSION": json.dumps(session_data)},
            response_url=self.client.make_url("/"),
        )

    async def create_team(
        self,
        username: str = "alice",
        *,
        name: str = "Variant Fans",
        request_required: bool = False,
        entry_code: str = "",
    ):
        self.add_live_user(username)
        self.set_session_user(username)
        data = {
            "name": name,
            "intro": "Play variants together",
            "description": "A friendly team for people who enjoy chess variants together.",
            "entryCode": entry_code,
        }
        if request_required:
            data["requestRequired"] = "1"
        return await self.client.post("/team/new", data=data, allow_redirects=False)

    async def test_team_pages_and_creation(self):
        anonymous_new = await self.client.get("/team/new", allow_redirects=False)
        self.assertEqual(302, anonymous_new.status)
        self.assertEqual("/login", anonymous_new.headers["Location"])

        response = await self.create_team()
        self.assertEqual(302, response.status)
        self.assertEqual("/team/variant-fans", response.headers["Location"])

        app_state = get_app_state(self.app)
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertIsNotNone(team)
        self.assertEqual(1, team["memberCount"])
        self.assertEqual("alice", team["createdBy"])
        self.assertEqual("none", team["forumAccess"])
        member = await app_state.db.team_member.find_one({"_id": "alice@variant-fans"})
        self.assertIsNotNone(member)
        self.assertEqual(TEAM_PERMISSIONS, frozenset(member["permissions"]))

        page = await self.client.get("/team/variant-fans")
        self.assertEqual(200, page.status)
        html = await page.text()
        self.assertIn("Variant Fans", html)
        self.assertIn("Play variants together", html)
        self.assertIn("You are a team leader", html)
        self.assertIn('href="/tournaments/new?team=variant-fans"', html)
        self.assertNotIn('href="/forum/team-variant-fans"', html)
        self.assertIn('href="/team">Teams</a>', html)

    async def test_team_members_page_lists_members_and_links_from_team(self):
        await self.create_team()
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        team_page = await self.client.get("/team/variant-fans")
        team_html = await team_page.text()
        self.assertIn('href="/team/variant-fans/members">2 members</a>', team_html)
        self.assertIn('href="/team/variant-fans/members">Recent members</a>', team_html)

        members_page = await self.client.get("/team/variant-fans/members")
        self.assertEqual(200, members_page.status)
        members_html = await members_page.text()
        self.assertIn('class="team-members-page page-small box"', members_html)
        self.assertIn('class="team-members slist slist-pad slist-invert"', members_html)
        self.assertIn('href="/@/alice"', members_html)
        self.assertIn('href="/@/bob"', members_html)

    async def test_restricted_team_join_uses_dedicated_request_form(self):
        await self.create_team(request_required=True, entry_code="secret")
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")

        team_page = await self.client.get("/team/variant-fans")
        team_html = await team_page.text()
        self.assertIn('class="team-show__join-action"', team_html)
        self.assertNotIn('name="message"', team_html)
        self.assertNotIn('name="entryCode"', team_html)

        join = await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.assertEqual(302, join.status)
        self.assertEqual("/team/variant-fans/join", join.headers["Location"])

        join_form = await self.client.get("/team/variant-fans/join")
        self.assertEqual(200, join_form.status)
        join_html = await join_form.text()
        self.assertIn('class="team-form-page team-join-page page-menu page-small"', join_html)
        self.assertIn('class="team-form form3 team-join-form"', join_html)
        self.assertIn('name="message"', join_html)
        self.assertIn('name="entryCode"', join_html)
        self.assertIn("A friendly team for people who enjoy chess variants together.", join_html)

        requested = await self.client.post(
            "/team/variant-fans/join",
            data={
                "message": "I would like to play variants with this team.",
                "entryCode": "secret",
            },
            allow_redirects=False,
        )
        self.assertEqual(302, requested.status)
        self.assertIsNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        self.assertIsNotNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))

    async def test_open_team_join_and_leave(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")

        joined = await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.assertEqual(302, joined.status)
        self.assertIsNotNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertEqual(2, team["memberCount"])

        left = await self.client.post("/team/variant-fans/quit", allow_redirects=False)
        self.assertEqual(302, left.status)
        self.assertIsNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertEqual(1, team["memberCount"])

        self.set_session_user("alice")
        creator_leave = await self.client.post("/team/variant-fans/quit", allow_redirects=False)
        self.assertEqual(403, creator_leave.status)

    async def test_team_tournament_requires_membership_and_leave_withdraws_player(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.add_live_user("charlie")

        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        tournament = SwissTestTournament(
            app_state,
            "team-swiss",
            variant="chess",
            rounds=5,
            team_id="variant-fans",
            created_by="alice",
            with_clock=False,
        )
        app_state.tournaments[tournament.id] = tournament
        await upsert_tournament_to_db(tournament, app_state)

        bob = app_state.users["bob"]
        charlie = app_state.users["charlie"]
        self.assertIsNone(await tournament.join(bob))
        self.assertEqual(
            "You must be a member of the tournament team to join.",
            await tournament.join(charlie),
        )

        left = await self.client.post("/team/variant-fans/quit", allow_redirects=False)
        self.assertEqual(302, left.status)
        bob_data = tournament.player_data_by_name("bob")
        self.assertIsNotNone(bob_data)
        assert bob_data is not None
        self.assertTrue(bob_data.withdrawn)
        self.assertEqual(0, tournament.nb_players)

    async def test_join_request_can_be_accepted(self):
        await self.create_team(request_required=True)
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")

        requested = await self.client.post(
            "/team/variant-fans/join",
            data={"message": "I would like to play variants with this team."},
            allow_redirects=False,
        )
        self.assertEqual(302, requested.status)
        self.assertIsNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        self.assertIsNotNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))

        self.set_session_user("alice")
        accepted = await self.client.post(
            "/team/variant-fans/request/bob/accept", allow_redirects=False
        )
        self.assertEqual(302, accepted.status)
        self.assertIsNotNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        self.assertIsNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertEqual(2, team["memberCount"])

    async def test_global_join_requests_and_declined_requests_pages(self):
        await self.create_team(request_required=True)
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post(
            "/team/variant-fans/join",
            data={"message": "I would like to join this team and play variants."},
            allow_redirects=False,
        )

        self.set_session_user("alice")
        requests_page = await self.client.get("/team/requests")
        self.assertEqual(200, requests_page.status)
        requests_html = await requests_page.text()
        self.assertIn("1 join request", requests_html)
        self.assertIn('href="/team/variant-fans">Variant Fans</a>', requests_html)
        self.assertIn('href="/@/bob">bob</a>', requests_html)
        self.assertIn('class="active" href="/team/requests">Join requests</a>', requests_html)

        declined = await self.client.post(
            "/team/variant-fans/request/bob/decline",
            data={"redirect": "/team/requests"},
            allow_redirects=False,
        )
        self.assertEqual(302, declined.status)
        self.assertEqual("/team/requests", declined.headers["Location"])
        request_doc = await app_state.db.team_request.find_one({"_id": "bob@variant-fans"})
        self.assertTrue(request_doc["declined"])

        team_page = await self.client.get("/team/variant-fans")
        team_html = await team_page.text()
        self.assertIn('href="/team/variant-fans/declined-requests"', team_html)
        self.assertNotIn('team-show__requests--declined', team_html)

        declined_page = await self.client.get("/team/variant-fans/declined-requests")
        self.assertEqual(200, declined_page.status)
        declined_html = await declined_page.text()
        self.assertIn("Declined requests", declined_html)
        self.assertIn('href="/@/bob">bob</a>', declined_html)
        self.assertIn('name="search"', declined_html)

        searched = await self.client.get("/team/variant-fans/declined-requests?search=nobody")
        self.assertEqual(200, searched.status)
        self.assertIn("No declined requests found.", await searched.text())

        restored = await self.client.post(
            "/team/variant-fans/request/bob/accept",
            data={"redirect": "/team/variant-fans/declined-requests?page=1"},
            allow_redirects=False,
        )
        self.assertEqual(302, restored.status)
        self.assertEqual(
            "/team/variant-fans/declined-requests?page=1", restored.headers["Location"]
        )
        self.assertIsNotNone(
            await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        )

    async def test_declined_requests_page_requires_request_permission(self):
        await self.create_team(request_required=True)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post(
            "/team/variant-fans/join",
            data={"message": "I would like to join this team and play variants."},
            allow_redirects=False,
        )
        denied = await self.client.get("/team/variant-fans/declined-requests")
        self.assertEqual(403, denied.status)

    async def test_pending_request_can_be_cancelled(self):
        await self.create_team(request_required=True)
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")

        await self.client.post(
            "/team/variant-fans/join",
            data={"message": "Please let me join this variant-playing team."},
            allow_redirects=False,
        )
        cancelled = await self.client.post(
            "/team/variant-fans/cancel-request", allow_redirects=False
        )
        self.assertEqual(302, cancelled.status)
        self.assertIsNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))

    async def test_entry_code_is_required(self):
        await self.create_team(entry_code="secret")
        self.add_live_user("bob")
        self.set_session_user("bob")
        app_state = get_app_state(self.app)

        denied = await self.client.post(
            "/team/variant-fans/join", data={"entryCode": "wrong"}, allow_redirects=False
        )
        self.assertEqual(403, denied.status)
        self.assertIsNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))

        joined = await self.client.post(
            "/team/variant-fans/join", data={"entryCode": "secret"}, allow_redirects=False
        )
        self.assertEqual(302, joined.status)

    async def test_kicked_member_cannot_immediately_rejoin(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        self.set_session_user("alice")
        kicked = await self.client.post("/team/variant-fans/kick/bob", allow_redirects=False)
        self.assertEqual(302, kicked.status)
        self.assertIsNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        request = await app_state.db.team_request.find_one({"_id": "bob@variant-fans"})
        self.assertIsNotNone(request)
        self.assertTrue(request["declined"])

        self.set_session_user("bob")
        team_page = await self.client.get("/team/variant-fans")
        team_html = await team_page.text()
        self.assertIn("Join request declined", team_html)
        self.assertNotIn('class="team-show__join-action"', team_html)

        rejoin = await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.assertEqual(403, rejoin.status)

        self.set_session_user("alice")
        restored = await self.client.post(
            "/team/variant-fans/request/bob/accept", allow_redirects=False
        )
        self.assertEqual(302, restored.status)
        self.assertIsNotNone(await app_state.db.team_member.find_one({"_id": "bob@variant-fans"}))
        self.assertIsNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))

    async def test_non_leader_cannot_edit_or_kick(self):
        await self.create_team()
        self.add_live_user("bob")
        self.add_live_user("charlie")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.set_session_user("charlie")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        self.set_session_user("bob")
        edit = await self.client.get("/team/variant-fans/edit")
        kick = await self.client.post("/team/variant-fans/kick/charlie", allow_redirects=False)
        self.assertEqual(403, edit.status)
        self.assertEqual(403, kick.status)

    async def test_creation_limit_is_three_teams_per_seven_days(self):
        for index in range(3):
            response = await self.create_team(name=f"Team Number {index}")
            self.assertEqual(302, response.status)

        response = await self.create_team(name="Fourth Team")
        self.assertEqual(403, response.status)

    async def test_team_admin_can_add_leader_and_manage_permissions(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        self.set_session_user("alice")
        added = await self.client.post(
            "/team/variant-fans/leaders/add",
            data={"username": "bob"},
            allow_redirects=False,
        )
        self.assertEqual(302, added.status)
        self.assertEqual("/team/variant-fans/leaders", added.headers["Location"])
        bob_member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertEqual([PERMISSION_PUBLIC], bob_member["permissions"])

        self.set_session_user("bob")
        denied = await self.client.get("/team/variant-fans/leaders")
        self.assertEqual(403, denied.status)

        self.set_session_user("alice")
        data = MultiDict()
        for username in ("alice", "bob"):
            data.add("leader", username)
        for permission in TEAM_PERMISSIONS:
            data.add("perm:alice", permission)
        data.add("perm:bob", PERMISSION_PUBLIC)
        data.add("perm:bob", PERMISSION_TOURNAMENTS)
        saved = await self.client.post(
            "/team/variant-fans/permissions", data=data, allow_redirects=False
        )
        self.assertEqual(302, saved.status)
        bob_member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertEqual(
            {PERMISSION_PUBLIC, PERMISSION_TOURNAMENTS}, set(bob_member["permissions"])
        )

    async def test_removing_all_permissions_removes_leader_status(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.set_session_user("alice")
        await self.client.post(
            "/team/variant-fans/leaders/add",
            data={"username": "bob"},
            allow_redirects=False,
        )

        data = MultiDict()
        data.add("leader", "alice")
        data.add("leader", "bob")
        for permission in TEAM_PERMISSIONS:
            data.add("perm:alice", permission)
        saved = await self.client.post(
            "/team/variant-fans/permissions", data=data, allow_redirects=False
        )
        self.assertEqual(302, saved.status)
        bob_member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertEqual([], bob_member["permissions"])

    async def test_creator_must_keep_admin_permission(self):
        await self.create_team()
        data = MultiDict()
        data.add("leader", "alice")
        for permission in TEAM_PERMISSIONS - {PERMISSION_ADMIN}:
            data.add("perm:alice", permission)
        response = await self.client.post(
            "/team/variant-fans/permissions", data=data, allow_redirects=False
        )
        self.assertEqual(400, response.status)

    async def test_team_pages_have_main_grid_area_css(self):
        root = Path(__file__).parents[1]
        css = (root / "static" / "team.css").read_text()
        team_page_selector = (
            ".teams-page,\n.team-form-page,\n.team-show-page,\n"
            ".team-members-page,\n.team-leaders-page"
        )
        self.assertIn(team_page_selector, css)
        self.assertIn(".team-updates-page,\n.team-update-form-page", css)
        self.assertIn("grid-area: main;", css)
        self.assertIn("width: min(1000px, calc(100vw - 2rem));", css)
        self.assertIn("grid-template-columns: 12.5rem minmax(0, 1fr);", css)
        self.assertIn(".team-show__content {", css)
        self.assertIn(".team-show__content__col1 {\n    flex: 0 0 30%;", css)
        self.assertIn(".team-members-page {", css)
        self.assertIn(".team-declined-requests-page,", css)
        self.assertIn(".team-requests {", css)
        self.assertIn(".team-declined-request-search {", css)
        self.assertIn(".team-updates-page.team-update {", css)
        self.assertIn(".team-update__side {", css)
        self.assertIn(".team-update--all .team-update__convo,", css)

        team_menu = (root / "templates" / "team-menu.html").read_text()
        teams = (root / "templates" / "teams.html").read_text()
        team_show = (root / "templates" / "team-show.html").read_text()
        team_members = (root / "templates" / "team-members.html").read_text()
        team_requests = (root / "templates" / "team-requests.html").read_text()
        team_declined_requests = (
            root / "templates" / "team-declined-requests.html"
        ).read_text()
        team_join = (root / "templates" / "team-join.html").read_text()
        team_new = (root / "templates" / "team-new.html").read_text()
        team_edit = (root / "templates" / "team-edit.html").read_text()
        team_leaders = (root / "templates" / "team-leaders.html").read_text()
        team_update_new = (root / "templates" / "team-update-new.html").read_text()
        self.assertIn('class="page-menu__menu subnav"', team_menu)
        self.assertIn('class="team-list-page teams-page page-menu"', teams)
        self.assertIn('class="team-slist slist slist-pad slist-invert"', teams)
        self.assertIn('class="team-show team-show-page box"', team_show)
        self.assertIn('class="team-show__content__col1"', team_show)
        self.assertIn('class="team-show__content__col2"', team_show)
        self.assertIn("href=\"/team/{{ team['_id'] }}/members\">Recent members</a>", team_show)
        self.assertIn('class="team-requests slist requests datatable"', team_show)
        self.assertIn('class="team-members-page page-small box"', team_members)
        self.assertIn('class="team-members slist slist-pad slist-invert"', team_members)
        self.assertIn('class="team-requests-page teams-page page-menu"', team_requests)
        self.assertIn(
            'class="team-requests team-requests--global slist requests datatable"',
            team_requests,
        )
        self.assertIn(
            'class="team-declined-requests-page page-menu page-small"',
            team_declined_requests,
        )
        self.assertIn(
            'class="team-requests team-declined-requests slist"',
            team_declined_requests,
        )
        self.assertIn('class="team-form-page team-join-page page-menu page-small"', team_join)
        self.assertIn('class="team-form form3 team-join-form"', team_join)
        self.assertIn('class="team-show__join-action"', team_show)
        self.assertIn('class="team-form-page page-menu page-small"', team_new)
        self.assertIn('class="team-form form3"', team_new)
        self.assertIn('class="form-split team-entry-fields"', team_new)
        self.assertIn('name="intro" minlength="3" maxlength="200" rows="2"', team_new)
        self.assertIn('class="team-form-page page-menu page-small team-edit"', team_edit)
        self.assertIn('class="page-menu__content box"', team_leaders)
        self.assertIn('class="team-add-leader box__pad"', team_leaders)
        self.assertIn('class="team-permissions form3"', team_leaders)
        self.assertIn('class="team-permissions-table slist slist-pad slist-resp"', team_leaders)
        self.assertIn('class="team-update-form-page page-menu page-small"', team_update_new)
        self.assertIn('class="team-form form3"', team_update_new)
        self.assertIn(".team-form-page.page-small,", css)
        self.assertIn(".team-form .form-group {", css)
        self.assertIn(".team-permissions__table {", css)

        forum_css = (root / "static" / "forum.css").read_text()
        self.assertIn(".forum {\n  grid-area: main;", forum_css)

    async def test_team_updates_are_member_only_and_marked_read_on_team_feed(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        denied = await self.client.get("/team/variant-fans/updates/new")
        self.assertEqual(403, denied.status)

        self.set_session_user("alice")
        sent = await self.client.post(
            "/team/variant-fans/updates",
            data={"message": "The first team championship starts this weekend."},
            allow_redirects=False,
        )
        self.assertEqual(302, sent.status)
        self.assertEqual("/team/variant-fans/updates", sent.headers["Location"])
        update = await app_state.db.team_update.find_one({"team": "variant-fans"})
        self.assertIsNotNone(update)
        self.assertEqual("alice", update["sender"])

        self.set_session_user("bob")
        combined = await self.client.get("/team/updates")
        self.assertEqual(200, combined.status)
        combined_html = await combined.text()
        self.assertIn("The first team championship starts this weekend.", combined_html)
        self.assertIn('class="team-update team-updates-page box team-update--all"', combined_html)
        self.assertIn("team-update__side__team--unread", combined_html)
        self.assertIn('team-update__side__unread-count">1', combined_html)
        self.assertIn("team-update__convo__update--unread", combined_html)

        team_feed = await self.client.get("/team/variant-fans/updates")
        self.assertEqual(200, team_feed.status)
        team_feed_html = await team_feed.text()
        self.assertIn('class="team-update team-updates-page box team-update--team"', team_feed_html)
        self.assertIn("team-update__side__team--active", team_feed_html)
        member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertIsNotNone(member.get("updatesSeenAt"))

        combined = await self.client.get("/team/updates")
        combined_html = await combined.text()
        self.assertNotIn("team-update__side__team--unread", combined_html)
        self.assertNotIn("team-update__convo__update--unread", combined_html)

    async def test_team_update_subscription_controls_combined_feed(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        unsubscribed = await self.client.post(
            "/team/variant-fans/subscribe",
            data={"subscribe": "0"},
            allow_redirects=False,
        )
        self.assertEqual(302, unsubscribed.status)
        member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertTrue(member["updatesUnsubscribed"])

        self.set_session_user("alice")
        await self.client.post(
            "/team/variant-fans/updates",
            data={"message": "This update should stay out of Bob's combined feed."},
            allow_redirects=False,
        )

        self.set_session_user("bob")
        combined = await self.client.get("/team/updates")
        self.assertNotIn(
            "This update should stay out of Bob's combined feed.", await combined.text()
        )
        team_feed = await self.client.get("/team/variant-fans/updates")
        self.assertIn("This update should stay out of Bob's combined feed.", await team_feed.text())

        resubscribed = await self.client.post(
            "/team/variant-fans/subscribe",
            data={"subscribe": "1"},
            allow_redirects=False,
        )
        self.assertEqual(302, resubscribed.status)
        member = await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        self.assertNotIn("updatesUnsubscribed", member)
        combined = await self.client.get("/team/updates")
        self.assertIn("This update should stay out of Bob's combined feed.", await combined.text())

    async def test_team_update_permission_can_be_delegated(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")
        await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)

        self.set_session_user("alice")
        await app_state.db.team_member.update_one(
            {"_id": "bob@variant-fans"},
            {"$set": {"permissions": [PERMISSION_UPDATES]}},
        )
        self.set_session_user("bob")
        page = await self.client.get("/team/variant-fans/updates/new")
        self.assertEqual(200, page.status)
        sent = await self.client.post(
            "/team/variant-fans/updates",
            data={"message": "A delegated leader can send this announcement."},
            allow_redirects=False,
        )
        self.assertEqual(302, sent.status)
        update = await app_state.db.team_update.find_one({"team": "variant-fans", "sender": "bob"})
        self.assertIsNotNone(update)

    async def test_team_update_rate_limit_is_ten_per_seven_days(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        now = datetime.now(UTC)
        await app_state.db.team_update.insert_many(
            [
                {
                    "_id": f"limit-{index}",
                    "team": "variant-fans",
                    "text": f"Existing update {index}",
                    "sender": "alice",
                    "createdAt": now,
                }
                for index in range(10)
            ]
        )
        response = await self.client.post(
            "/team/variant-fans/updates",
            data={"message": "One update too many."},
            allow_redirects=False,
        )
        self.assertEqual(429, response.status)
