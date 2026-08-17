import json
import time

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient
from pychess_global_app_state_utils import get_app_state
from team import TEAM_PERMISSIONS
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
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

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
        member = await app_state.db.team_member.find_one({"_id": "alice@variant-fans"})
        self.assertIsNotNone(member)
        self.assertEqual(TEAM_PERMISSIONS, frozenset(member["permissions"]))

        page = await self.client.get("/team/variant-fans")
        self.assertEqual(200, page.status)
        html = await page.text()
        self.assertIn("Variant Fans", html)
        self.assertIn("Play variants together", html)
        self.assertIn("You are a team leader", html)
        self.assertIn('href="/team">Teams</a>', html)

    async def test_open_team_join_and_leave(self):
        await self.create_team()
        app_state = get_app_state(self.app)
        self.add_live_user("bob")
        self.set_session_user("bob")

        joined = await self.client.post("/team/variant-fans/join", data={}, allow_redirects=False)
        self.assertEqual(302, joined.status)
        self.assertIsNotNone(
            await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        )
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
        self.assertIsNotNone(
            await app_state.db.team_request.find_one({"_id": "bob@variant-fans"})
        )

        self.set_session_user("alice")
        accepted = await self.client.post(
            "/team/variant-fans/request/bob/accept", allow_redirects=False
        )
        self.assertEqual(302, accepted.status)
        self.assertIsNotNone(
            await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        )
        self.assertIsNone(await app_state.db.team_request.find_one({"_id": "bob@variant-fans"}))
        team = await app_state.db.team.find_one({"_id": "variant-fans"})
        self.assertEqual(2, team["memberCount"])

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
        rejoin = await self.client.post(
            "/team/variant-fans/join", data={}, allow_redirects=False
        )
        self.assertEqual(403, rejoin.status)

        self.set_session_user("alice")
        restored = await self.client.post(
            "/team/variant-fans/request/bob/accept", allow_redirects=False
        )
        self.assertEqual(302, restored.status)
        self.assertIsNotNone(
            await app_state.db.team_member.find_one({"_id": "bob@variant-fans"})
        )
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
