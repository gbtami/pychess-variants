# -*- coding: utf-8 -*-

from typing import Any, cast

from aiohttp.test_utils import AioHTTPTestCase
from mongomock_motor import AsyncMongoMockClient

from bot_accounts import create_bot_token
from game import Game
from glicko2.glicko2 import new_default_perf_map
from pychess_global_app_state_utils import get_app_state
from seek import Seek
from server import make_app
from user import User
from variants import VARIANTS


PERFS = new_default_perf_map(VARIANTS)


class BotApiSecurityTestCase(AioHTTPTestCase):
    async def get_application(self):
        return make_app(db_client=cast(Any, AsyncMongoMockClient(tz_aware=True)))

    async def tearDownAsync(self):
        await self.client.close()

    async def create_bot(self, username: str) -> tuple[User, str]:
        app_state = get_app_state(self.app)
        user = User(app_state, bot=True, username=username, title="BOT", perfs=PERFS)
        app_state.users[user.username] = user
        await app_state.db.user.insert_one(
            {
                "_id": username,
                "username_lower": username.lower(),
                "enabled": True,
                "title": "BOT",
                "count": {"game": 0, "win": 0, "loss": 0, "draw": 0, "rated": 0},
            }
        )
        _, raw_token = await create_bot_token(app_state, username, f"{username} token")
        return user, raw_token

    @staticmethod
    def auth_headers(raw_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {raw_token}"}

    async def test_challenge_accept_and_decline_require_invited_bot(self):
        app_state = get_app_state(self.app)
        challenger = User(app_state, username="human", perfs=PERFS)
        app_state.users[challenger.username] = challenger
        owner_bot, _ = await self.create_bot("owner-bot")
        _, other_token = await self.create_bot("other-bot")

        seek = Seek(
            "seek1234",
            challenger,
            "chess",
            target="BOT_challenge",
            player1=challenger,
            player2=owner_bot,
            game_id="abcd1234",
            rated=False,
        )
        app_state.invites["abcd1234"] = seek

        for path in ("/api/challenge/abcd1234/accept", "/api/challenge/abcd1234/decline"):
            response = await self.client.post(path, headers=self.auth_headers(other_token))
            self.assertEqual(response.status, 403, path)

    async def test_bot_game_endpoints_require_authenticated_bot_to_be_player(self):
        app_state = get_app_state(self.app)
        owner_bot, _ = await self.create_bot("owner-bot")
        _, other_token = await self.create_bot("other-bot")
        human = User(app_state, username="human", perfs=PERFS)
        app_state.users[human.username] = human

        game = Game(app_state, "game1234", "chess", "", owner_bot, human, rated=False)
        app_state.games[game.id] = game

        requests = (
            ("get", f"/api/bot/game/stream/{game.id}", {}),
            ("post", f"/api/bot/game/{game.id}/move/e2e4", {}),
            ("post", f"/api/bot/game/{game.id}/abort", {}),
            ("post", f"/api/bot/game/{game.id}/resign", {}),
            ("post", f"/api/bot/game/{game.id}/chat", {"data": {"room": "player", "text": "hi"}}),
        )

        for method, path, kwargs in requests:
            response = await getattr(self.client, method)(
                path,
                headers=self.auth_headers(other_token),
                **kwargs,
            )
            self.assertEqual(response.status, 403, path)
