# -*- coding: utf-8 -*-

import asyncio
import random
from datetime import datetime, timezone

from pychess_global_app_state_utils import get_app_state
from const import (
    BYEGAME,
    STARTED,
    ARENA,
    RR,
    SWISS,
    TEST_PREFIX,
)
from draw import draw
from fairy import BLACK
from game import MAX_PLY
from glicko2.glicko2 import DEFAULT_PERF
from tournament.arena_new import ArenaTournament
from tournament.rr import RRTournament
from tournament.swiss import SwissTournament
from tournament.tournament import Tournament, upsert_tournament_to_db
from user import User
from utils import play_move
from variants import VARIANTS

import logging

log = logging.getLogger(__name__)

# from misc import timeit

PERFS = {variant: DEFAULT_PERF for variant in VARIANTS}

AUTO_PLAY_ARENA_NAME = "Auto Play Arena"


async def create_auto_play_arena(app):
    app_state = get_app_state(app)
    tid = "12345678"
    if tid in app_state.tournaments:
        tournament = app_state.tournaments[tid]
        return

    await app_state.db.tournament.delete_one({"_id": tid})
    await app_state.db.tournament_player.delete_many({"tid": tid})
    await app_state.db.tournament_pairing.delete_many({"tid": tid})

    tournament = ArenaTestTournament(
        app_state,
        tid,
        variant="gorogoroplus",
        name=AUTO_PLAY_ARENA_NAME,
        chess960=False,
        base=1,
        before_start=0.5,
        minutes=10,
        created_by="PyChess",
    )

    app_state.tournaments[tid] = tournament
    app_state.tourneysockets[tid] = {}

    await upsert_tournament_to_db(tournament, app_state)

    if tournament.nb_players == 0:
        await tournament.join_players(19)


class TestTournament(Tournament):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.game_tasks = set()

    async def join_players(self, nb_players):
        for i in range(1, nb_players + 1):
            name = "%sUser_%s" % (TEST_PREFIX, i)
            player = User(self.app_state, username=name, title="TEST", perfs=PERFS)
            self.app_state.users[player.username] = player
            player.tournament_sockets[self.id] = set((None,))
            await self.join(player)

    async def create_new_pairings(self, waiting_players):
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print("--- create_new_pairings at %s ---" % now)
        self.print_leaderboard()
        pairing, games = await Tournament.create_new_pairings(self, waiting_players)

        # aouto play test games
        # for wp, bp in pairing:
        #     print("%s - %s" % (wp.username, bp.username))
        print("--- create_new_pairings done ---")

        for game in games:
            if game.status == BYEGAME:  # ByeGame
                continue
            self.app_state.games[game.id] = game
            game.random_mover = True
            self.game_tasks.add(asyncio.create_task(self.play_random(game)))

    # @timeit
    async def play_random(self, game):
        """Play random moves for TEST players"""
        if game.status == BYEGAME:  # ByeGame
            return

        if self.system == ARENA:
            if random.choice((True, False)):
                game.berserk("white")

            if random.choice((True, False)):
                game.berserk("black")

            await asyncio.sleep(random.choice((0, 0.1, 0.3, 0.5, 0.7)))

        game.status = STARTED
        while game.status <= STARTED:
            cur_player = game.bplayer if game.board.color == BLACK else game.wplayer
            opp_player = game.wplayer if game.board.color == BLACK else game.bplayer
            if cur_player.title == "TEST":
                ply = random.randint(20, int(MAX_PLY / 10))
                if game.board.ply == ply or game.board.ply > 60:
                    player = game.wplayer if ply % 2 == 0 else game.bplayer
                    if game.board.ply > 60:
                        response = await draw(game, cur_player.username, agreement=True)
                    else:
                        response = await game.game_ended(player, "resign")
                    if opp_player.title != "TEST":
                        await opp_player.send_game_message(game.id, response)
                else:
                    move = random.choice(game.legal_moves)
                    clocks = (game.clocks_w[-1], game.clocks_b[-1])
                    await play_move(self.app_state, cur_player, game, move, clocks=clocks)
            await asyncio.sleep(0.01)


class ArenaTestTournament(TestTournament, ArenaTournament):
    system = ARENA

    def create_pairing(self, waiting_players):
        return ArenaTournament.create_pairing(self, waiting_players)


class RRTestTournament(TestTournament, RRTournament):
    system = RR

    def create_pairing(self, waiting_players):
        return RRTournament.create_pairing(self, waiting_players)


class SwissTestTournament(TestTournament, SwissTournament):
    system = SWISS

    def create_pairing(self, waiting_players):
        return SwissTournament.create_pairing(self, waiting_players)
