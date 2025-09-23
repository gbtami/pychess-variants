# -*- coding: utf-8 -*-

import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import asyncio
import unittest
import json

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from const import T_CREATED, T_STARTED, T_FINISHED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from server import make_app
from simul.simul import Simul
from user import User

class SimulTestCase(AioHTTPTestCase):
    async def get_application(self):
        app = make_app(db_client=AsyncMongoMockClient())
        return app

    async def test_simul_creation_and_pairing(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        self.assertEqual(len(simul.players), 1) # Host is automatically a player

        for i in range(2, NB_PLAYERS + 1):
            player = User(app_state, username=f"TestUser_{i}")
            app_state.users[player.username] = player
            simul.join(player)
            simul.approve(player.username)

        self.assertEqual(len(simul.players), NB_PLAYERS)

        await simul.start()

        self.assertEqual(simul.status, T_STARTED)
        self.assertEqual(len(simul.ongoing_games), NB_PLAYERS - 1)

        for game in simul.ongoing_games:
            self.assertTrue(game.wplayer.username == host_username or game.bplayer.username == host_username)

    async def test_simul_join_approve_and_deny(self):
        app_state = get_app_state(self.app)
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

        self.assertEqual(len(simul.pending_players), 2)

        simul.approve(player2.username)
        self.assertEqual(len(simul.pending_players), 1)
        self.assertEqual(len(simul.players), 2) # Host + player2
        self.assertIn(player2.username, simul.players)

        simul.deny(player3.username)
        self.assertEqual(len(simul.pending_players), 0)
        self.assertNotIn(player3.username, simul.players)

    async def test_simul_websocket(self):
        app_state = get_app_state(self.app)
        host_username = "TestUser_1"
        sid = id8()

        host = User(app_state, username=host_username)
        app_state.users[host.username] = host

        simul = await Simul.create(app_state, sid, name="Test Simul", created_by=host_username)
        app_state.simuls[sid] = simul

        client = await self.client.ws_connect(f'/wss?simulId={sid}')

        player2 = User(app_state, username="TestUser_2")
        app_state.users[player2.username] = player2

        await client.send_json({"type": "join", "simulId": sid})
        await client.send_json({"type": "approve_player", "simulId": sid, "username": "TestUser_2"})

        msg = await client.receive_json()
        self.assertEqual(msg['type'], 'player_approved')
        self.assertEqual(msg['username'], 'TestUser_2')

        await client.send_json({"type": "deny_player", "simulId": sid, "username": "TestUser_2"})
        msg = await client.receive_json()
        self.assertEqual(msg['type'], 'player_denied')
        self.assertEqual(msg['username'], 'TestUser_2')


if __name__ == "__main__":
    unittest.main(verbosity=2)
