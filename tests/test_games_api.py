# -*- coding: utf-8 -*-
import json
import time
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import test_logger
from aiohttp.client_exceptions import ClientConnectionResetError
from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

import game_api
from const import STARTED, SWISS
from game import Game
from game_api import _seen_discontinued_variants, safe_write_eof, variant_counts_from_docs
from pychess_global_app_state_utils import get_app_state
from server import make_app
from user import User
import utils
from variants import VARIANTS, get_server_variant
from settings import MONGO_DB_NAME

test_logger.init_test_logger()


class GamesApiCategoryFilterTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        self.user = User(app_state, username="testuser", game_category="chess")
        app_state.users[self.user.username] = self.user

        wplayer = User(app_state, username="white")
        bplayer = User(app_state, username="black")
        app_state.users[wplayer.username] = wplayer
        app_state.users[bplayer.username] = bplayer

        chess_game = Game(app_state, "g1", "chess", "", wplayer, bplayer)
        chess_game.status = STARTED
        app_state.games[chess_game.id] = chess_game

        shogi_game = Game(app_state, "g2", "shogi", "", wplayer, bplayer)
        shogi_game.status = STARTED
        app_state.games[shogi_game.id] = shogi_game

        chess960_game = Game(app_state, "g3", "chess", "", wplayer, bplayer, chess960=True)
        chess960_game.status = STARTED
        app_state.games[chess960_game.id] = chess960_game

        chess_code = get_server_variant("chess", False).code
        await app_state.db.game.insert_one(
            {
                "_id": "db1",
                "us": [self.user.username, wplayer.username],
                "v": chess_code,
                "z": 0,
                "r": "a",
                "m": [],
                "s": STARTED,
                "d": datetime(2025, 1, 1),
                "y": 1,
            }
        )

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_games_filtered_by_category(self):
        session_data = {"session": {"user_name": self.user.username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

        response = await self.client.get("/api/games")
        self.assertEqual(response.status, 200)
        payload = await response.json()

        variants = {(item["variant"], item["chess960"]) for item in payload}
        self.assertIn(("chess", False), variants)
        self.assertIn(("chess", True), variants)
        self.assertNotIn(("shogi", False), variants)

    async def test_profile_perf_unknown_variant_returns_not_found_page(self):
        session_data = {"session": {"user_name": self.user.username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

        response = await self.client.get(f"/@/{self.user.username}/perf/notavariant")
        self.assertEqual(response.status, 200)
        text = await response.text()
        self.assertIn("Page not found!", text)

    async def test_api_profile_perf_unknown_variant_returns_empty(self):
        session_data = {"session": {"user_name": self.user.username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

        response = await self.client.get(f"/api/{self.user.username}/perf/notavariant")
        self.assertEqual(response.status, 200)
        payload = await response.json()
        self.assertEqual(payload, [])


class VariantStatsTestCase(unittest.TestCase):
    def test_discontinued_variants_logged_once(self):
        variant_counts = {variant: [] for variant in VARIANTS}
        docs = [
            {"_id": {"p": "202501", "v": "m", "z": 1}, "c": 1},
            {"_id": {"p": "202501", "v": "m", "z": 1}, "c": 2},
            {"_id": {"p": "202501", "v": "o", "z": 0}, "c": 3},
            {"_id": {"p": "202501", "v": "o", "z": 0}, "c": 4},
        ]

        _seen_discontinued_variants.clear()
        try:
            with patch("game_api.log.info") as info:
                variant_counts_from_docs(variant_counts, docs)

            warned_variants = {call.args[1] for call in info.call_args_list}
            self.assertEqual({"makruk960", "gothic"}, warned_variants)
            self.assertEqual(2, info.call_count)
        finally:
            _seen_discontinued_variants.clear()


class ExportPGNTestCase(AioHTTPTestCase):
    async def startup(self, app):
        app_state = get_app_state(self.app)
        user = User(app_state, username="testuser")
        app_state.users[user.username] = user

        export_docs = [
            {"_id": f"g{i}", "us": ["testuser"], "v": "Z", "d": datetime(2025, 12, 1)}
            for i in range(6)
        ]
        await app_state.db.game.insert_many(export_docs)

    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient(), simple_cookie_storage=True)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def test_export_aggregates_legacy_failures(self):
        with (
            patch("game_api.pgn", side_effect=ValueError("invalid move")) as pgn_mock,
            patch("game_api.log.error") as error,
            patch("game_api.log.info") as info,
        ):
            response = await self.client.get("/games/export/testuser")
            self.assertEqual(response.status, 200)
            await response.text()

        self.assertEqual(6, pgn_mock.call_count)
        error.assert_not_called()

        summary_calls = [
            call
            for call in info.call_args_list
            if call.args and call.args[0] == "PGN export skipped invalid/legacy games: %s"
        ]
        self.assertEqual(1, len(summary_calls))
        self.assertIn("g0 ataxx 2025.12.01", summary_calls[0].args[1])
        self.assertNotIn("g5 ataxx 2025.12.01", summary_calls[0].args[1])


class ExportTournamentTrfTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=AsyncMongoMockClient(), simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    async def test_export_swiss_tournament_trf(self):
        tournament = SimpleNamespace(system=SWISS)
        trf_text = "001    1      player\n"

        with (
            patch("game_api.load_tournament", new=AsyncMock(return_value=tournament)),
            patch("tournament.swiss.build_trf_export_text", return_value=trf_text) as build_trf,
        ):
            response = await self.client.get("/games/export/tournament/abc12345/trf")

        self.assertEqual(response.status, 200)
        self.assertEqual(response.content_type, "text/plain")
        self.assertEqual(await response.text(), trf_text)
        self.assertIn("pychess_tournament_abc12345.trf", response.headers["Content-Disposition"])
        build_trf.assert_called_once_with(tournament)

    async def test_export_trf_rejects_non_swiss_tournament(self):
        tournament = SimpleNamespace(system=0)

        with patch("game_api.load_tournament", new=AsyncMock(return_value=tournament)):
            response = await self.client.get("/games/export/tournament/abc12345/trf")

        self.assertEqual(response.status, 400)


class ExportWriteEofTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_safe_write_eof_ignores_client_disconnect(self):
        response = AsyncMock()
        response.write_eof.side_effect = ClientConnectionResetError(
            "Cannot write to closing transport"
        )

        with patch("game_api.log.exception") as error, patch("game_api.log.debug") as debug:
            await safe_write_eof(response)

        error.assert_not_called()
        debug.assert_called_once_with("Connection closed before PGN export EOF write.")


class SSESubscribeErrorFallbackTestCase(unittest.IsolatedAsyncioTestCase):
    class _UsersStub:
        def __init__(self, user):
            self.user = user

        async def get(self, _username):
            return self.user

    async def test_subscribe_notify_handles_sse_setup_error(self):
        notify_user = SimpleNamespace(notify_channels=set())
        app_state = SimpleNamespace(users=self._UsersStub(notify_user))
        request = SimpleNamespace(app=object())

        with (
            patch("utils.get_app_state", return_value=app_state),
            patch(
                "utils.aiohttp_session.get_session",
                new=AsyncMock(return_value={"user_name": "sse-user"}),
            ),
            patch("utils.sse_response", side_effect=RuntimeError("setup failed")),
        ):
            response = await utils.subscribe_notify(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(len(notify_user.notify_channels), 0)

    async def test_subscribe_invites_handles_sse_setup_error(self):
        game_id = "abcd1234"
        app_state = SimpleNamespace(invite_channels={game_id: set()})
        request = SimpleNamespace(app=object(), match_info={"gameId": game_id})

        with (
            patch("game_api.get_app_state", return_value=app_state),
            patch("game_api.sse_response", side_effect=RuntimeError("setup failed")),
        ):
            response = await game_api.subscribe_invites(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(len(app_state.invite_channels[game_id]), 0)

    async def test_subscribe_games_handles_sse_setup_error(self):
        app_state = SimpleNamespace(game_channels=set())
        request = SimpleNamespace(app=object())

        with (
            patch("game_api.get_app_state", return_value=app_state),
            patch("game_api.sse_response", side_effect=RuntimeError("setup failed")),
        ):
            response = await game_api.subscribe_games(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(len(app_state.game_channels), 0)


class InviteReloadPersistenceTestCase(AioHTTPTestCase):
    async def get_application(self):
        db_client = AsyncMongoMockClient()
        db = db_client[MONGO_DB_NAME]
        await db.user.insert_many(
            [
                {"_id": "InviteCreator", "title": "", "enabled": True},
                {"_id": "InviteVisitor", "title": "", "enabled": True},
            ]
        )
        await db.seek.insert_one(
            {
                "_id": "seekInvite",
                "user": "InviteCreator",
                "variant": "chess",
                "chess960": False,
                "target": "Invite-friend",
                "fen": "",
                "color": "r",
                "rated": False,
                "rrmin": -10000,
                "rrmax": 10000,
                "base": 5,
                "inc": 5,
                "byoyomi": 0,
                "day": 0,
                "gameId": "AbCd1234",
            }
        )
        await db.seek.insert_one(
            {
                "_id": "seekInviteExpired",
                "user": "InviteCreator",
                "variant": "chess",
                "chess960": False,
                "target": "Invite-friend",
                "fen": "",
                "color": "r",
                "rated": False,
                "rrmin": -10000,
                "rrmax": 10000,
                "base": 5,
                "inc": 5,
                "byoyomi": 0,
                "day": 0,
                "gameId": "Expi1234",
                "expireAt": datetime.now(timezone.utc) - timedelta(minutes=1),
            }
        )
        return make_app(db_client=db_client, simple_cookie_storage=True)

    async def tearDownAsync(self):
        await self.client.close()

    def _set_session_user(self, username: str) -> None:
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        self.client.session.cookie_jar.update_cookies({"AIOHTTP_SESSION": json.dumps(session_data)})

    async def test_reloaded_invite_page_is_available_after_restart(self):
        self._set_session_user("InviteVisitor")
        response = await self.client.get("/invite/AbCd1234")
        self.assertEqual(response.status, 200)
        html = await response.text()
        self.assertIn('data-inviter="InviteCreator"', html)

    async def test_reloaded_invite_accept_starts_game_with_same_game_id(self):
        self._set_session_user("InviteVisitor")
        response = await self.client.post("/invite/accept/AbCd1234")
        self.assertEqual(response.status, 200)
        html = await response.text()
        self.assertIn('data-view="round"', html)
        self.assertIn('data-gameid="AbCd1234"', html)

    async def test_reloaded_expired_invite_page_shows_expired_state(self):
        self._set_session_user("InviteVisitor")
        response = await self.client.get("/invite/Expi1234")
        self.assertEqual(response.status, 200)
        html = await response.text()
        self.assertIn('data-inviter="expired"', html)
        app_state = get_app_state(self.app)
        self.assertNotIn("Expi1234", app_state.invites)

    async def test_reloaded_expired_invite_accept_shows_expired_state(self):
        self._set_session_user("InviteVisitor")
        response = await self.client.post("/invite/accept/Expi1234")
        self.assertEqual(response.status, 200)
        html = await response.text()
        self.assertIn('data-inviter="expired"', html)
