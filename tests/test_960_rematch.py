# -*- coding: utf-8 -*-

import logging
import unittest
import random

from aiohttp.test_utils import AioHTTPTestCase

from const import VARIANTS
from glicko2.glicko2 import DEFAULT_PERF
from game import Game
from user import User
from utils import join_seek
from server import make_app
import game
from seek import Seek

game.KEEP_TIME = 0
game.MAX_PLY = 120

logging.basicConfig()
logging.getLogger().setLevel(level=logging.ERROR)

PERFS = {
    "newplayer": {variant: DEFAULT_PERF for variant in VARIANTS},
}


class RamatchChess960GameTestCase(AioHTTPTestCase):
    async def startup(self, app):
        self.Aplayer = User(self.app, username="Aplayer", perfs=PERFS["newplayer"])
        self.Bplayer = User(self.app, username="Bplayer", perfs=PERFS["newplayer"])

    async def get_application(self):
        app = make_app(with_db=False)
        app.on_startup.append(self.startup)
        return app

    async def tearDownAsync(self):
        await self.client.close()

    async def play_game_and_rematch_game(self, game_odd):
        print("%s - %s %s" % (game_odd.wplayer, game_odd.bplayer, game_odd.initial_fen))
        await game_odd.game_ended(game_odd.wplayer, "flag")

        rematch_offfered_by = random.choice((self.Aplayer, self.Bplayer))
        print("offerer:", rematch_offfered_by.username)
        rematch_accepted_by = self.Aplayer if self.Bplayer == rematch_offfered_by else self.Bplayer
        color = "w" if game_odd.bplayer.username == rematch_offfered_by.username else "b"
        seek = Seek(
            rematch_offfered_by,
            game_odd.variant,
            fen=game_odd.initial_fen,
            color=color,
            base=game_odd.base,
            inc=game_odd.inc,
            byoyomi_period=game_odd.byoyomi_period,
            level=game_odd.level,
            rated=game_odd.rated,
            player1=rematch_offfered_by,
            chess960=game_odd.chess960,
        )
        self.app["seeks"][seek.id] = seek

        response = await join_seek(self.app, rematch_accepted_by, seek.id)
        rematch_id = response["gameId"]

        game_even = self.app["games"][rematch_id]
        print("%s - %s %s" % (game_even.wplayer, game_even.bplayer, game_even.initial_fen))
        self.assertEqual(game_odd.initial_fen, game_even.initial_fen)

        await game_even.game_ended(game_even.wplayer, "flag")

        rematch_offfered_by = random.choice((self.Aplayer, self.Bplayer))
        print("offerer:", rematch_offfered_by.username)
        rematch_accepted_by = self.Aplayer if self.Bplayer == rematch_offfered_by else self.Bplayer
        color = "w" if game_odd.bplayer.username == rematch_offfered_by.username else "b"
        seek = Seek(
            rematch_offfered_by,
            game_even.variant,
            fen=game_even.initial_fen,
            color=color,
            base=game_even.base,
            inc=game_even.inc,
            byoyomi_period=game_even.byoyomi_period,
            level=game_even.level,
            rated=game_even.rated,
            player1=rematch_offfered_by,
            chess960=game_even.chess960,
        )
        self.app["seeks"][seek.id] = seek

        response = await join_seek(self.app, rematch_accepted_by, seek.id)
        rematch_id = response["gameId"]

        game_odd = self.app["games"][rematch_id]
        self.assertNotEqual(game_even.initial_fen, game_odd.initial_fen)
        return game_odd

    async def test_ramatch(self):
        game_odd = Game(
            self.app, "12345678", "chess", "", self.Aplayer, self.Bplayer, chess960=True
        )
        print()

        for i in range(100):
            print(i)
            game_odd = await self.play_game_and_rematch_game(game_odd)


if __name__ == "__main__":
    unittest.main(verbosity=2)
