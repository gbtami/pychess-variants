# -*- coding: utf-8 -*-
import json
import logging
import test_logger
import time
import aiohttp
import pytest

from mongomock_motor import AsyncMongoMockClient

from const import T_CREATED, T_STARTED, CASUAL
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from simul.simul import Simul
from user import User

test_logger.init_test_logger()

log = logging.getLogger(__name__)


@pytest.mark.asyncio
class TestGUI:
    async def test_simul_creation_and_pairing(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1", port=8080)
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

    async def test_simul_join_approve_and_deny(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1", port=8080)
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

    async def test_simul_cannot_start_without_opponents(self, aiohttp_server):
        app = make_app(db_client=AsyncMongoMockClient())
        await aiohttp_server(app, host="127.0.0.1", port=8080)
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

    async def _connect_ws(self, username: str):
        session = aiohttp.ClientSession()
        session_data = {"session": {"user_name": username}, "created": int(time.time())}
        value = json.dumps(session_data)
        session.cookie_jar.update_cookies({"AIOHTTP_SESSION": value})
        ws = await session.ws_connect("ws://127.0.0.1:8080/wss")
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
        await aiohttp_server(app, host="127.0.0.1", port=8080)
        app_state = get_app_state(app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2

        host_session, host_ws = await self._connect_ws(host_username)
        player_session, player_ws = await self._connect_ws(player2.username)

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

            await host_ws.send_json(
                {"type": "approve_player", "simulId": sid, "username": player2.username}
            )
            msg = await self._receive_until_type(host_ws, "player_approved")
            assert msg["type"] == "player_approved"
            assert msg["player"]["name"] == player2.username
            assert player2.username in simul.players
            assert player2.username not in simul.pending_players

            await player_ws.close()
            msg = await self._receive_until_type(host_ws, "player_disconnected")
            assert msg["username"] == player2.username
            assert player2.username not in simul.players
        finally:
            await host_ws.close()
            await host_session.close()
            await player_session.close()
