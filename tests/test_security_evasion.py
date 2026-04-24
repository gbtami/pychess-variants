# -*- coding: utf-8 -*-

import asyncio
import json
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import test_logger
from aiohttp.test_utils import AioHTTPTestCase, make_mocked_request
from mongomock_motor import AsyncMongoMockClient

from admin import ban, baninfo, unban
from newid import id8
from pychess_global_app_state_utils import get_app_state
from security_evasion import collect_client_signals
from server import make_app
from tournament.auto_play_tournament import ArenaTestTournament
from tournament.tournament import upsert_tournament_to_db
from tournament.tournaments import load_tournament
from user import User
from wsl import handle_lobbychat

test_logger.init_test_logger()


class SignupSecurityEvasionTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def _set_session(self, payload: dict[str, str]) -> None:
        session_data = {"session": payload, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_check_username_availability_rejects_case_only_duplicate(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one(
            {"_id": "ExistingUser", "username_lower": "existinguser"}
        )

        response = await self.client.post(
            "/api/check-username",
            json={"username": "existinguser"},
        )

        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertFalse(body.get("available"))
        self.assertEqual(body.get("error"), "Username is already taken")

    async def test_confirm_username_rejects_case_only_duplicate(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one(
            {"_id": "ExistingUser", "username_lower": "existinguser"}
        )
        self._set_session(
            {
                "oauth_id": "oauth-case-duplicate",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "case-duplicate-origin",
            }
        )

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "existinguser"},
        )

        self.assertEqual(response.status, 400)
        body = await response.json()
        self.assertEqual(body.get("error"), "Username is already taken")

    async def test_confirm_username_auto_closes_on_ipfp_ban_signal(self):
        app_state = get_app_state(self.app)
        headers = {
            "X-Forwarded-For": "198.51.100.44",
            "User-Agent": "SecurityTestUA/1.0",
            "Accept-Language": "en-US,en;q=0.8",
            "Cookie": "pcfp=fp-test",
        }
        mock_req = make_mocked_request("POST", "/api/confirm-username", headers=headers)
        signals = collect_client_signals(mock_req)
        self.assertIsNotNone(signals.ipfp_hash)
        await app_state.db.security_ban_signal.insert_one(
            {"_id": f"ipfp:{signals.ipfp_hash}", "kind": "ipfp"}
        )

        self._set_session(
            {
                "oauth_id": "oauth-evil",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "evil-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-test"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "blocked_signup"},
            headers={
                "X-Forwarded-For": "198.51.100.44",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 403)

        created = await app_state.db.user.find_one({"_id": "blocked_signup"})
        self.assertIsNotNone(created)
        self.assertFalse(created.get("enabled", True))

    async def test_confirm_username_succeeds_without_ban_signals(self):
        app_state = get_app_state(self.app)
        self._set_session(
            {
                "oauth_id": "oauth-good",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "good-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-good"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "normal_signup"},
            headers={
                "X-Forwarded-For": "198.51.100.55",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertTrue(body.get("success"))

        created = await app_state.db.user.find_one({"_id": "normal_signup"})
        self.assertIsNotNone(created)
        self.assertTrue(created.get("enabled", False))

    async def test_confirm_username_succeeds_on_fp_signal_with_single_source(self):
        app_state = get_app_state(self.app)
        headers = {
            "X-Forwarded-For": "198.51.100.66",
            "User-Agent": "SecurityTestUA/1.0",
            "Accept-Language": "en-US,en;q=0.8",
            "Cookie": "pcfp=fp-single-source",
        }
        mock_req = make_mocked_request("POST", "/api/confirm-username", headers=headers)
        signals = collect_client_signals(mock_req)
        self.assertIsNotNone(signals.fp_hash)
        await app_state.db.security_ban_signal.insert_one(
            {
                "_id": f"fp:{signals.fp_hash}",
                "kind": "fp",
                "sources": ["cheater_a"],
            }
        )

        self._set_session(
            {
                "oauth_id": "oauth-fp-single",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "fp-single-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-single-source"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "fp_single_allowed"},
            headers={
                "X-Forwarded-For": "198.51.100.66",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 200)
        body = await response.json()
        self.assertTrue(body.get("success"))

        created = await app_state.db.user.find_one({"_id": "fp_single_allowed"})
        self.assertIsNotNone(created)
        self.assertTrue(created.get("enabled", False))

    async def test_confirm_username_auto_closes_on_fp_signal_with_multiple_sources(self):
        app_state = get_app_state(self.app)
        headers = {
            "X-Forwarded-For": "198.51.100.77",
            "User-Agent": "SecurityTestUA/1.0",
            "Accept-Language": "en-US,en;q=0.8",
            "Cookie": "pcfp=fp-multi-source",
        }
        mock_req = make_mocked_request("POST", "/api/confirm-username", headers=headers)
        signals = collect_client_signals(mock_req)
        self.assertIsNotNone(signals.fp_hash)
        await app_state.db.security_ban_signal.insert_one(
            {
                "_id": f"fp:{signals.fp_hash}",
                "kind": "fp",
                "sources": ["cheater_a", "cheater_b"],
            }
        )

        self._set_session(
            {
                "oauth_id": "oauth-fp-multi",
                "oauth_provider": "lichess",
                "oauth_title": "",
                "oauth_username": "fp-multi-origin",
            }
        )
        self.client.session.cookie_jar.update_cookies({"pcfp": "fp-multi-source"})

        response = await self.client.post(
            "/api/confirm-username",
            json={"username": "fp_multi_blocked"},
            headers={
                "X-Forwarded-For": "198.51.100.77",
                "User-Agent": "SecurityTestUA/1.0",
                "Accept-Language": "en-US,en;q=0.8",
            },
        )
        self.assertEqual(response.status, 403)

        created = await app_state.db.user.find_one({"_id": "fp_multi_blocked"})
        self.assertIsNotNone(created)
        self.assertFalse(created.get("enabled", True))


class AdminBanUnbanSignalsTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(tz_aware=True))

    async def tearDownAsync(self):
        await self.client.close()

    async def test_ban_stores_signals_and_unban_reenables_user(self):
        app_state = get_app_state(self.app)
        user = User(app_state, username="cheater")
        app_state.users[user.username] = user

        await app_state.db.user.insert_one(
            {
                "_id": "cheater",
                "enabled": True,
                "security": {
                    "ipHashes": ["iph1"],
                    "fpHashes": ["fph1"],
                    "ipfpHashes": ["ipfph1"],
                },
            }
        )

        await ban(app_state, "/ban cheater")
        banned_doc = await app_state.db.user.find_one({"_id": "cheater"})
        self.assertFalse(banned_doc.get("enabled", True))
        self.assertFalse(user.enabled)

        signals = await app_state.db.security_ban_signal.find().to_list(length=10)
        kinds = {doc.get("kind") for doc in signals}
        self.assertIn("ip", kinds)
        self.assertIn("fp", kinds)
        self.assertIn("ipfp", kinds)

        await unban(app_state, "/unban cheater")
        unbanned_doc = await app_state.db.user.find_one({"_id": "cheater"})
        self.assertTrue(unbanned_doc.get("enabled", False))
        self.assertTrue(user.enabled)

    async def test_baninfo_reports_autoclose_reason_and_active_counts(self):
        app_state = get_app_state(self.app)
        auto_close_at = datetime.now(timezone.utc)
        await app_state.db.user.insert_one(
            {
                "_id": "closed_user",
                "enabled": False,
                "security": {
                    "ipHashes": ["iph1"],
                    "fpHashes": ["fph1"],
                    "ipfpHashes": ["ipfph1"],
                    "lastAutoCloseReason": "ipfp",
                    "lastAutoCloseAt": auto_close_at,
                },
            }
        )
        await app_state.db.security_ban_signal.insert_many(
            [
                {"_id": "ip:iph1", "kind": "ip"},
                {"_id": "fp:fph1", "kind": "fp"},
                {"_id": "ipfp:ipfph1", "kind": "ipfp"},
            ]
        )

        response = await baninfo(app_state, "/baninfo closed_user")
        self.assertEqual(response["type"], "lobbychat")
        message = response["message"]
        self.assertIn("enabled=False", message)
        self.assertIn("autoClose=ipfp", message)
        self.assertIn("stored(ip=1,fp=1,ipfp=1)", message)
        self.assertIn("active(ip=1,fp=1,ipfp=1)", message)

    async def test_baninfo_command_does_not_ban_user(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_one({"_id": "target_user", "enabled": True, "security": {}})

        admin_user = User(app_state, username="test_admin")
        ws = object()
        payload = {"type": "lobbychat", "message": "/baninfo target_user"}

        with (
            patch("wsl.ADMINS", ["test_admin"]),
            patch("wsl.ws_send_json", new=AsyncMock()) as send,
        ):
            await handle_lobbychat(app_state, ws, admin_user, payload)

        target_doc = await app_state.db.user.find_one({"_id": "target_user"})
        self.assertTrue(target_doc.get("enabled", False))
        send.assert_awaited_once()

    async def test_unban_removes_only_unbanned_user_signal_sources(self):
        app_state = get_app_state(self.app)
        await app_state.db.user.insert_many(
            [
                {
                    "_id": "cheater_a",
                    "enabled": True,
                    "security": {
                        "ipHashes": ["shared", "only_a"],
                        "fpHashes": [],
                        "ipfpHashes": [],
                    },
                },
                {
                    "_id": "cheater_b",
                    "enabled": True,
                    "security": {"ipHashes": ["shared"], "fpHashes": [], "ipfpHashes": []},
                },
            ]
        )

        await ban(app_state, "/ban cheater_a")
        await ban(app_state, "/ban cheater_b")

        shared_before = await app_state.db.security_ban_signal.find_one({"_id": "ip:shared"})
        self.assertIsNotNone(shared_before)
        self.assertEqual(set(shared_before.get("sources", [])), {"cheater_a", "cheater_b"})

        await unban(app_state, "/unban cheater_a")

        only_a = await app_state.db.security_ban_signal.find_one({"_id": "ip:only_a"})
        self.assertIsNone(only_a)

        shared_after = await app_state.db.security_ban_signal.find_one({"_id": "ip:shared"})
        self.assertIsNotNone(shared_after)
        self.assertEqual(set(shared_after.get("sources", [])), {"cheater_b"})

    async def test_ban_withdraws_user_from_created_tournament(self):
        app_state = get_app_state(self.app)
        username = "cheater_created"
        user = User(app_state, username=username)
        app_state.users[user.username] = user
        await app_state.db.user.insert_one({"_id": username, "enabled": True, "security": {}})

        tid = id8()
        tournament = ArenaTestTournament(
            app_state, tid, before_start=10, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = tournament
        app_state.tourneysockets[tid] = {}
        await tournament.join(user)

        self.assertEqual(tournament.user_status(user), "joined")
        self.assertIn(user, tournament.leaderboard)

        await ban(app_state, f"/ban {username}")

        player = tournament.get_player_by_name(username)
        self.assertIsNotNone(player)
        assert player is not None
        self.assertTrue(tournament.players[player].withdrawn)
        self.assertNotIn(player, tournament.leaderboard)
        self.assertEqual(tournament.user_status(player), "withdrawn")

    async def test_ban_pauses_user_in_started_tournament(self):
        app_state = get_app_state(self.app)
        username = "cheater_started"
        user = User(app_state, username=username)
        app_state.users[user.username] = user
        await app_state.db.user.insert_one({"_id": username, "enabled": True, "security": {}})

        tid = id8()
        tournament = ArenaTestTournament(
            app_state, tid, before_start=10, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = tournament
        app_state.tourneysockets[tid] = {}
        await tournament.join(user)
        await tournament.start(datetime.now(timezone.utc))

        await ban(app_state, f"/ban {username}")

        player = tournament.get_player_by_name(username)
        self.assertIsNotNone(player)
        assert player is not None
        self.assertTrue(tournament.players[player].paused)
        self.assertFalse(tournament.players[player].withdrawn)
        self.assertIn(player, tournament.leaderboard)
        self.assertEqual(tournament.user_status(player), "paused")

    async def test_ban_created_tournament_state_persists_after_reload(self):
        app_state = get_app_state(self.app)
        username = "cheater_created_reload"
        user = User(app_state, username=username)
        app_state.users[user.username] = user
        await app_state.db.user.insert_one({"_id": username, "enabled": True, "security": {}})

        tid = id8()
        tournament = ArenaTestTournament(
            app_state, tid, before_start=10, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = tournament
        app_state.tourneysockets[tid] = {}
        await upsert_tournament_to_db(tournament, app_state)
        await tournament.join(user)

        await ban(app_state, f"/ban {username}")

        app_state.tournaments.pop(tid, None)
        app_state.tourneysockets.pop(tid, None)
        reloaded = await load_tournament(app_state, tid)
        self.assertIsNotNone(reloaded)
        assert reloaded is not None

        player = reloaded.get_player_by_name(username)
        self.assertIsNotNone(player)
        assert player is not None
        self.assertTrue(reloaded.players[player].withdrawn)
        self.assertFalse(reloaded.players[player].paused)
        self.assertNotIn(player, reloaded.leaderboard)
        self.assertEqual(reloaded.user_status(player), "withdrawn")

        if reloaded.clock_task is not None:
            reloaded.clock_task.cancel()
            try:
                await reloaded.clock_task
            except asyncio.CancelledError:
                pass

    async def test_ban_started_tournament_state_persists_after_reload(self):
        app_state = get_app_state(self.app)
        banned_username = "cheater_started_reload"
        opponent_username = "opponent_started_reload"
        banned_user = User(app_state, username=banned_username)
        opponent_user = User(app_state, username=opponent_username)
        app_state.users[banned_user.username] = banned_user
        app_state.users[opponent_user.username] = opponent_user
        await app_state.db.user.insert_many(
            [
                {"_id": banned_username, "enabled": True, "security": {}},
                {"_id": opponent_username, "enabled": True, "security": {}},
            ]
        )

        tid = id8()
        tournament = ArenaTestTournament(
            app_state, tid, before_start=10, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = tournament
        app_state.tourneysockets[tid] = {}
        await upsert_tournament_to_db(tournament, app_state)
        await tournament.join(banned_user)
        await tournament.join(opponent_user)
        await tournament.start(datetime.now(timezone.utc))

        await ban(app_state, f"/ban {banned_username}")

        app_state.tournaments.pop(tid, None)
        app_state.tourneysockets.pop(tid, None)
        reloaded = await load_tournament(app_state, tid)
        self.assertIsNotNone(reloaded)
        assert reloaded is not None

        banned_player = reloaded.get_player_by_name(banned_username)
        opponent_player = reloaded.get_player_by_name(opponent_username)
        self.assertIsNotNone(banned_player)
        self.assertIsNotNone(opponent_player)
        assert banned_player is not None
        assert opponent_player is not None

        self.assertTrue(reloaded.players[banned_player].paused)
        self.assertFalse(reloaded.players[banned_player].withdrawn)
        self.assertIn(banned_player, reloaded.leaderboard)
        self.assertEqual(reloaded.user_status(banned_player), "paused")

        class _DummyWs:
            async def close(self):
                return None

        dummy_ws = _DummyWs()
        for player in reloaded.players:
            player.tournament_sockets[tid] = set((dummy_ws,))
            reloaded.app_state.tourneysockets[tid][player.username] = player.tournament_sockets[tid]

        waiting_players = reloaded.waiting_players()
        self.assertIn(opponent_player, waiting_players)
        self.assertNotIn(banned_player, waiting_players)

        if reloaded.clock_task is not None:
            reloaded.clock_task.cancel()
            try:
                await reloaded.clock_task
            except asyncio.CancelledError:
                pass
