# -*- coding: utf-8 -*-

import asyncio
from datetime import datetime, timezone

from const import FLAG, TEST_PREFIX
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.arena import ArenaTournament
from tournament.rr import RRTournament
from tournament.tournament import SCORE_SHIFT, upsert_tournament_to_db
from tournament_test_base import TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


class TournamentScoringTestCase(TournamentTestCase):
    async def test_rr_berger_tiebreak_orders_tied_scores_and_is_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTournament(
            app_state, tid, variant="chess", before_start=0, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        users = []
        for suffix in ("A", "B", "C", "D"):
            user = User(
                app_state,
                username=f"{TEST_PREFIX}{suffix}",
                title="TEST",
                perfs=make_test_perfs(),
            )
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        await self.tournament.start(datetime.now(timezone.utc))

        winner_sets_by_round = [
            {users[0].username, users[1].username},  # A beats D, B beats C
            {users[0].username, users[3].username},  # A beats B, D beats C
            {users[1].username, users[2].username},  # B beats D, C beats A
        ]

        for round_no, winners in enumerate(winner_sets_by_round, start=1):
            self.tournament.current_round = round_no
            waiting_players = list(self.tournament.waiting_players())
            _, games = await self.tournament.create_new_pairings(waiting_players)
            for game in games:
                if game.wplayer.username in winners:
                    game.result = "1-0"
                elif game.bplayer.username in winners:
                    game.result = "0-1"
                else:
                    self.fail(
                        f"Unexpected pairing {game.wplayer.username} vs {game.bplayer.username}"
                    )
                game.status = FLAG
                game.board.ply = 20
                await self.tournament.game_update(game)
                self.tournament.players[game.wplayer].free = True
                self.tournament.players[game.bplayer].free = True

        leaderboard = [player.username for player in self.tournament.leaderboard]
        self.assertEqual(
            leaderboard,
            [users[0].username, users[1].username, users[2].username, users[3].username],
        )

        player_a_data = self.tournament.player_data_by_name(users[0].username)
        player_b_data = self.tournament.player_data_by_name(users[1].username)
        player_c_data = self.tournament.player_data_by_name(users[2].username)
        player_d_data = self.tournament.player_data_by_name(users[3].username)
        self.assertIsNotNone(player_a_data)
        self.assertIsNotNone(player_b_data)
        self.assertIsNotNone(player_c_data)
        self.assertIsNotNone(player_d_data)
        assert player_a_data is not None
        assert player_b_data is not None
        assert player_c_data is not None
        assert player_d_data is not None
        self.assertEqual(player_a_data.berger, 12)
        self.assertEqual(player_b_data.berger, 8)
        self.assertEqual(player_c_data.berger, 8)
        self.assertEqual(player_d_data.berger, 4)

        players_json = self.tournament.players_json()
        self.assertEqual(players_json["players"][0]["berger"], 6.0)
        self.assertEqual(players_json["players"][1]["berger"], 4.0)

        games_json = await self.tournament.games_json(users[0].username)
        self.assertEqual(games_json["berger"], 6.0)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        reloaded_leaderboard = [player.username for player in reloaded_tournament.leaderboard]
        self.assertEqual(
            reloaded_leaderboard,
            [users[0].username, users[1].username, users[2].username, users[3].username],
        )

        reloaded_a = reloaded_tournament.player_data_by_name(users[0].username)
        self.assertIsNotNone(reloaded_a)
        assert reloaded_a is not None
        self.assertEqual(reloaded_a.berger, 12)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

    async def test_arena_berserk_win_streak_persisted(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        player_a = User(
            app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=make_test_perfs()
        )
        player_b = User(
            app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=make_test_perfs()
        )
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

        player_a = User(
            app_state, username=f"{TEST_PREFIX}A", title="TEST", perfs=make_test_perfs()
        )
        player_b = User(
            app_state, username=f"{TEST_PREFIX}B", title="TEST", perfs=make_test_perfs()
        )
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

        winner = game.wplayer
        player_data = self.tournament.players[winner]
        self.assertEqual(player_data.points[0][0], 3)
        self.assertEqual(self.tournament.leaderboard[winner] // SCORE_SHIFT, 3)

        _, reloaded_tournament = await self.reload_tournament(app_state.db_client, tid)
        reloaded_user = next(
            user for user in reloaded_tournament.players if user.username == winner.username
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
