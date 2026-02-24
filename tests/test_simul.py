# -*- coding: utf-8 -*-
import json
import logging
import test_logger
import time
import asyncio
import aiohttp
import pytest

from mongomock_motor import AsyncMongoMockClient

from const import T_CREATED, T_STARTED, CASUAL
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from simul.simul import Simul
from simul.simuls import load_active_simuls
from pychess_global_app_state import PychessGlobalAppState
from typedefs import pychess_global_app_state_key
from user import User

test_logger.init_test_logger()

log = logging.getLogger(__name__)


@pytest.mark.asyncio
class TestGUI:
    async def test_simul_creation_and_pairing(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        NB_PLAYERS = 5
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        assert len(simul.players) == 1  # Host is automatically a player

        for i in range(2, NB_PLAYERS + 1):
            player = User(app_state, username=f"TestUser_{i}")
            app_state.users[player.username] = player
            simul.join(player)
            simul.approve(player.username)

        assert len(simul.players) == NB_PLAYERS

        await simul.start()

        assert simul.status == T_STARTED
        assert len(simul.ongoing_games) == NB_PLAYERS - 1

        for game in simul.ongoing_games:
            assert game.wplayer.username == host_username or game.bplayer.username == host_username
            assert game.simulId == sid
            assert game.rated == CASUAL

        if app_state.db is not None:
            game_doc = await app_state.db.game.find_one({"sid": sid})
            assert game_doc is not None
            simul_doc = await app_state.db.simul.find_one({"_id": sid})
            assert simul_doc is not None
            assert simul_doc["status"] == T_STARTED
            assert len(simul_doc["players"]) == NB_PLAYERS

    async def test_simul_join_approve_and_deny(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2
        simul.join(player2)

        player3 = User(app_state, username="TestUser_3")
        app_state.users[player3.username] = player3
        simul.join(player3)

        assert len(simul.pending_players) == 2

        simul.approve(player2.username)
        assert len(simul.pending_players) == 1
        assert len(simul.players) == 2  # Host + player2
        assert player2.username in simul.players

        simul.deny(player3.username)
        assert len(simul.pending_players) == 0
        assert player3.username not in simul.players

        simul.deny(player2.username)
        assert player2.username not in simul.players
        assert len(simul.players) == 1  # Host only

        assert simul.deny(host_username) is False
        assert host_username in simul.players

    async def test_simul_cannot_start_without_opponents(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        started = await simul.start()
        assert started is False
        assert simul.status == T_CREATED

    async def _connect_ws(self, username: str, port: int):
        session = aiohttp.ClientSession()
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        value = json.dumps(session_data)
        session.cookie_jar.update_cookies({"AIOHTTP_SESSION": value})
        ws = await session.ws_connect(f"ws://127.0.0.1:{port}/wss")
        return session, ws

    async def _receive_until_type(self, ws, expected_type: str, max_messages: int = 6):
        for _ in range(max_messages):
            msg = await ws.receive_json()
            if msg.get("type") == expected_type:
                return msg
        raise AssertionError(f"Did not receive expected ws message type: {expected_type}")

    async def test_simul_websocket(self, aiohttp_server):
        app = make_app(
            db_client=AsyncMongoMockClient(), simple_cookie_storage=True, anon_as_test_users=True
        )
        server = await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2

        host_session, host_ws = await self._connect_ws(host_username, server.port)
        player_session, player_ws = await self._connect_ws(player2.username, server.port)

        try:
            await host_ws.send_json(
                {"type": "simul_user_connected", "username": host_username, "simulId": sid}
            )
            msg = await host_ws.receive_json()
            assert msg["type"] == "simul_user_connected"
            assert msg["username"] == host_username
            assert msg["players"][0]["name"] == host_username

            await player_ws.send_json(
                {"type": "simul_user_connected", "username": player2.username, "simulId": sid}
            )
            msg = await player_ws.receive_json()
            assert msg["type"] == "simul_user_connected"

            await player_ws.send_json({"type": "join", "simulId": sid})
            msg = await self._receive_until_type(host_ws, "player_joined")
            assert msg["type"] == "player_joined"
            assert msg["player"]["name"] == player2.username
            assert player2.username in simul.pending_players
            if app_state.db is not None:
                simul_doc = await app_state.db.simul.find_one({"_id": sid})
                assert simul_doc is not None
                assert player2.username in simul_doc["pendingPlayers"]
                assert host_username in simul_doc["players"]

            await host_ws.send_json(
                {"type": "approve_player", "simulId": sid, "username": player2.username}
            )
            msg = await self._receive_until_type(host_ws, "player_approved")
            assert msg["type"] == "player_approved"
            assert msg["player"]["name"] == player2.username
            assert player2.username in simul.players
            assert player2.username not in simul.pending_players
            if app_state.db is not None:
                simul_doc = await app_state.db.simul.find_one({"_id": sid})
                assert simul_doc is not None
                assert player2.username in simul_doc["players"]
                assert player2.username not in simul_doc["pendingPlayers"]

            await player_ws.close()
            msg = await self._receive_until_type(host_ws, "player_disconnected")
            assert msg["username"] == player2.username
            assert player2.username not in simul.players
            if app_state.db is not None:
                simul_doc = await app_state.db.simul.find_one({"_id": sid})
                assert simul_doc is not None
                assert player2.username not in simul_doc["players"]
                assert player2.username not in simul_doc["pendingPlayers"]
        finally:
            await host_ws.close()
            await host_session.close()
            await player_session.close()

    async def test_simul_websocket_host_can_remove_approved_player(self, aiohttp_server):
        app = make_app(
            db_client=AsyncMongoMockClient(), simple_cookie_storage=True, anon_as_test_users=True
        )
        server = await aiohttp_server(app, host="127.0.0.1")
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2

        host_session, host_ws = await self._connect_ws(host_username, server.port)
        player_session, player_ws = await self._connect_ws(player2.username, server.port)

        try:
            await host_ws.send_json(
                {"type": "simul_user_connected", "username": host_username, "simulId": sid}
            )
            msg = await host_ws.receive_json()
            assert msg["type"] == "simul_user_connected"

            await player_ws.send_json(
                {"type": "simul_user_connected", "username": player2.username, "simulId": sid}
            )
            msg = await player_ws.receive_json()
            assert msg["type"] == "simul_user_connected"

            await player_ws.send_json({"type": "join", "simulId": sid})
            msg = await self._receive_until_type(host_ws, "player_joined")
            assert msg["player"]["name"] == player2.username

            await host_ws.send_json(
                {"type": "approve_player", "simulId": sid, "username": player2.username}
            )
            msg = await self._receive_until_type(host_ws, "player_approved")
            assert msg["player"]["name"] == player2.username
            assert player2.username in simul.players

            await host_ws.send_json(
                {"type": "deny_player", "simulId": sid, "username": player2.username}
            )
            msg = await self._receive_until_type(host_ws, "player_denied")
            assert msg["username"] == player2.username
            msg = await self._receive_until_type(player_ws, "player_denied")
            assert msg["username"] == player2.username
            assert player2.username not in simul.players
            assert player2.username not in simul.pending_players
            if app_state.db is not None:
                simul_doc = await app_state.db.simul.find_one({"_id": sid})
                assert simul_doc is not None
                assert player2.username not in simul_doc["players"]
                assert player2.username not in simul_doc["pendingPlayers"]
        finally:
            await host_ws.close()
            await player_ws.close()
            await host_session.close()
            await player_session.close()

    async def test_started_simul_reloads_after_restart(self, aiohttp_server):
        db_client = AsyncMongoMockClient()
        app = make_app(db_client=db_client)
        await aiohttp_server(app)
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(
            app_state, sid, name="Persistent Simul", created_by=host_username
        )
        app_state.simuls[sid] = simul

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2
        simul.join(player2)
        simul.approve(player2.username)

        started = await simul.start()
        assert started is True
        assert simul.status == T_STARTED
        assert len(simul.games) == 1
        assert simul.clock_task is not None

        reloaded_app = make_app(db_client=db_client)
        reloaded_app[pychess_global_app_state_key] = PychessGlobalAppState(reloaded_app)
        reloaded_state = get_app_state(reloaded_app)
        await load_active_simuls(reloaded_state)

        reloaded_simul = reloaded_state.simuls.get(sid)
        assert reloaded_simul is not None
        assert reloaded_simul.status == T_STARTED
        assert host_username in reloaded_simul.players
        assert player2.username in reloaded_simul.players
        assert len(reloaded_simul.games) == 1
        assert len(reloaded_simul.ongoing_games) == 1
        assert reloaded_simul.clock_task is not None

        if reloaded_simul.clock_task is not None:
            reloaded_simul.clock_task.cancel()
            try:
                await reloaded_simul.clock_task
            except asyncio.CancelledError:
                pass
