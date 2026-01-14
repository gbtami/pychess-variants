# -*- coding: utf-8 -*-

import asyncio
from datetime import datetime, timezone

from const import FLAG, TEST_PREFIX
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.arena_new import ArenaTournament
from tournament.auto_play_arena import PERFS
from tournament.tournament import SCORE_SHIFT, upsert_tournament_to_db
from tournament_test_base import TournamentTestCase
from user import User


class TournamentScoringTestCase(TournamentTestCase):
    async def test_arena_berserk_win_streak_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        player_a = User(app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=PERFS)
        player_b = User(app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=PERFS)
        app_state.users[player_a.username] = player_a
        app_state.users[player_b.username] = player_b
        player_a.tournament_sockets[tid] = set((None,))
        player_b.tournament_sockets[tid] = set((None,))

        await self.tournament.join(player_a)
        await self.tournament.join(player_b)
        await self.tournament.start(datetime.now(timezone.utc))

        async def finish_game(game, winner):
            if winner is game.wplayer:
                game.result = "1-0"
                game.wberserk = True
                game.bberserk = False
            else:
                game.result = "0-1"
                game.bberserk = True
                game.wberserk = False
            game.status = FLAG
            game.board.ply = 20
            await self.tournament.game_update(game)

        for _ in range(2):
            waiting_players = list(self.tournament.waiting_players())
            _, games = await self.tournament.create_new_pairings(waiting_players)
            game = games[0]
            await finish_game(game, player_a)
            self.tournament.players[player_a].free = True
            self.tournament.players[player_b].free = True

        player_data = self.tournament.players[player_a]
        self.assertEqual(player_data.win_streak, 2)
        self.assertEqual(player_data.nb_berserk, 2)
        self.assertEqual(self.tournament.nb_berserk, 2)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        reloaded_player = next(
            pdata
            for pdata in reloaded_tournament.players.values()
            if pdata.username == player_a.username
        )
        self.assertEqual(reloaded_player.win_streak, 2)
        self.assertEqual(reloaded_player.nb_berserk, 2)
        self.assertEqual(reloaded_tournament.nb_berserk, 2)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_arena_berserk_bonus_points_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        player_a = User(app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=PERFS)
        player_b = User(app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=PERFS)
        app_state.users[player_a.username] = player_a
        app_state.users[player_b.username] = player_b
        player_a.tournament_sockets[tid] = set((None,))
        player_b.tournament_sockets[tid] = set((None,))

        await self.tournament.join(player_a)
        await self.tournament.join(player_b)
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]

        game.result = "1-0"
        game.status = FLAG
        game.wberserk = True
        game.bberserk = False
        game.board.ply = 13

        await self.tournament.game_update(game)

        player_data = self.tournament.players[player_a]
        self.assertEqual(player_data.points[0][0], 3)
        self.assertEqual(self.tournament.leaderboard[player_a] // SCORE_SHIFT, 3)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        reloaded_user = next(
            user for user in reloaded_tournament.players if user.username == player_a.username
        )
        reloaded_player = reloaded_tournament.players[reloaded_user]
        self.assertEqual(reloaded_player.points[0][0], 3)
        self.assertEqual(reloaded_tournament.leaderboard[reloaded_user] // SCORE_SHIFT, 3)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass
