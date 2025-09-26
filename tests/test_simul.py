# -*- coding: utf-8 -*-
import json
import logging
import time
import aiohttp
import pytest

from mongomock_motor import AsyncMongoMockClient

from const import T_STARTED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from simul.simul import Simul
from user import User
from logger import log


log.setLevel(level=logging.DEBUG)


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

        async with aiohttp.ClientSession() as session:
            session_data = {"session": {"user_name": host_username}, "created": int(time.time())}
            value = json.dumps(session_data)
            session.cookie_jar.update_cookies({"AIOHTTP_SESSION": value})

            client = await session.ws_connect("ws://127.0.0.1:8080/wss")

            await client.send_json(
                {"type": "simul_user_connected", "username": host_username, "simulId": sid}
            )
            msg = await client.receive_json()
            assert msg["type"] == "simul_user_connected"
            assert msg["username"] == host_username

            player2 = User(app_state, username="TestUser_2")
            app_state.users[player2.username] = player2

            await client.send_json({"type": "join", "simulId": sid})
            msg = await client.receive_json()
            assert msg["type"] == "player_joined"

            await client.send_json(
                {"type": "approve_player", "simulId": sid, "username": "TestUser_2"}
            )
            msg = await client.receive_json()
            assert msg["type"] == "player_approved"
            assert msg["username"] == "TestUser_2"
