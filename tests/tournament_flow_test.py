# -*- coding: utf-8 -*-

import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from importlib.util import find_spec
import os
from pathlib import Path
from unittest.mock import patch

from const import FLAG, T_CREATED, T_FINISHED, T_STARTED
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament import swiss as swiss_mod
from tournament.auto_play_arena import (
    ArenaTestTournament,
    RRTestTournament,
    SwissTestTournament,
)
from tournament.tournament import MANUAL_ROUND_INTERVAL, GameData, upsert_tournament_to_db
from tournament_test_base import ONE_TEST_ONLY, TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


def _has_swisspairing_runtime() -> bool:
    if find_spec("swisspairing") is not None:
        return True
    raw_src = os.getenv("SWISSPAIRING_SRC", "").strip()
    return raw_src != "" and Path(raw_src).expanduser().exists()


class TournamentFlowTestCase(TournamentTestCase):
    @staticmethod
    def _accelerate_arena_clock(tournament):
        """Shrink arena pairing cadence for faster deterministic tests."""
        tournament.wave = timedelta(milliseconds=200)
        tournament.wave_delta = timedelta(milliseconds=25)
        return tournament

    def _new_condition_user(
        self,
        tournament,
        username: str,
        *,
        title: str = "IM",
        rating: int = 1600,
        rated_games: int = 25,
        account_age_days: int = 60,
    ) -> User:
        app_state = get_app_state(self.app)
        user = User(
            app_state,
            username=username,
            title=title,
            perfs=make_test_perfs(),
            created_at=datetime.now(timezone.utc) - timedelta(days=account_age_days),
        )
        user.perfs["chess"]["gl"]["r"] = rating
        user.perfs["chess"]["nb"] = rated_games
        user.tournament_sockets[tournament.id] = set((None,))
        app_state.users[user.username] = user
        return user

    async def _assert_non_swiss_entry_conditions(self, tournament) -> None:
        app_state = get_app_state(self.app)
        app_state.tournaments[tournament.id] = tournament

        untitled = self._new_condition_user(tournament, f"{tournament.id}_untitled", title="")
        self.assertEqual(
            await tournament.join(untitled),
            "This tournament is limited to titled players.",
        )

        low_rated = self._new_condition_user(tournament, f"{tournament.id}_low", rating=1300)
        self.assertEqual(
            await tournament.join(low_rated),
            "Your rating is below the minimum allowed for this tournament.",
        )

        too_new = self._new_condition_user(tournament, f"{tournament.id}_new", account_age_days=5)
        self.assertEqual(
            await tournament.join(too_new),
            "This tournament requires accounts to be at least 30 days old.",
        )

        too_few_games = self._new_condition_user(
            tournament, f"{tournament.id}_few_games", rated_games=5
        )
        self.assertEqual(
            await tournament.join(too_few_games),
            "This tournament requires at least 20 rated Chess games.",
        )

        allowed = self._new_condition_user(tournament, f"{tournament.id}_allowed")
        self.assertIsNone(await tournament.join(allowed))

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_arena_join_enforces_generic_entry_conditions(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=1,
            minutes=10,
            with_clock=False,
            entry_min_rating=1400,
            entry_max_rating=1800,
            entry_min_rated_games=20,
            entry_min_account_age_days=30,
            entry_titled_only=True,
        )
        await self._assert_non_swiss_entry_conditions(self.tournament)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_rr_join_enforces_generic_entry_conditions(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=1,
            rounds=3,
            with_clock=False,
            entry_min_rating=1400,
            entry_max_rating=1800,
            entry_min_rated_games=20,
            entry_min_account_age_days=30,
            entry_titled_only=True,
        )
        await self._assert_non_swiss_entry_conditions(self.tournament)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_without_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = self._accelerate_arena_clock(
            ArenaTestTournament(app_state, tid, before_start=0, minutes=2.0 / 60.0)
        )
        app_state.tournaments[tid] = self.tournament

        self.assertEqual(self.tournament.status, T_CREATED)

        await asyncio.sleep(0.05)
        self.assertEqual(self.tournament.status, T_STARTED)

        if self.tournament.clock_task is not None:
            await asyncio.wait_for(self.tournament.clock_task, timeout=5)
        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_players(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, before_start=0, minutes=0, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS)

        withdrawn_player = next(iter(self.tournament.players))
        await self.tournament.withdraw(withdrawn_player)

        self.assertNotIn(withdrawn_player, self.tournament.leaderboard)
        self.assertEqual(len(self.tournament.players), NB_PLAYERS)
        self.assertEqual(len(self.tournament.leaderboard), NB_PLAYERS - 1)

        self.assertEqual(self.tournament.status, T_CREATED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_with_3_active_players(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = self._accelerate_arena_clock(
            ArenaTestTournament(app_state, tid, before_start=0.01, minutes=0.08)
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        # 12 player leave the tournament lobby
        for i in range(12):
            del list(self.tournament.players.keys())[i].tournament_sockets[self.tournament.id]
        self.assertEqual(len(self.tournament.waiting_players()), NB_PLAYERS - 12)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

        for user in self.tournament.players:
            self.assertTrue(self.tournament.players[user].nb_not_paired <= 1)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_5_round_SWISS(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=NB_ROUNDS)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss tournament flow test",
    )
    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_5_round_SWISS_with_swisspairing_backend(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 15
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = SwissTestTournament(app_state, tid, before_start=0, rounds=NB_ROUNDS)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_fixed_round_swiss_ignores_minutes_deadline(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 7
        NB_ROUNDS = 3
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=0,
            rounds=NB_ROUNDS,
            minutes=0,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        if self.tournament.clock_task is not None:
            await asyncio.wait_for(self.tournament.clock_task, timeout=20)

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_1_min_ARENA(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 15
        tid = id8()
        self.tournament = self._accelerate_arena_clock(
            ArenaTestTournament(app_state, tid, before_start=0.01, minutes=0.08)
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        # withdraw one player
        await self.tournament.withdraw(list(self.tournament.players.keys())[-1])
        self.assertEqual(self.tournament.nb_players, NB_PLAYERS - 1)

        # make the first player leave the tournament lobby
        del list(self.tournament.players.keys())[0].tournament_sockets[self.tournament.id]

        self.assertEqual(len(self.tournament.waiting_players()), NB_PLAYERS - 2)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_tournament_pairing_5_round_RR(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5
        NB_ROUNDS = 5

        tid = id8()
        self.tournament = RRTestTournament(app_state, tid, before_start=0, rounds=NB_ROUNDS)
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        await self.tournament.clock_task

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_fixed_round_rr_ignores_minutes_deadline(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5
        NB_ROUNDS = 5
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=0,
            rounds=NB_ROUNDS,
            minutes=0,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)

        if self.tournament.clock_task is not None:
            await asyncio.wait_for(self.tournament.clock_task, timeout=20)

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            NB_PLAYERS * [NB_ROUNDS],
        )

    async def test_fixed_round_manual_next_round_waits_for_organizer(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=0,
            rounds=2,
            round_interval=MANUAL_ROUND_INTERVAL,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        self.assertTrue(
            await self.tournament.maybe_schedule_next_fixed_round(datetime.now(timezone.utc))
        )
        self.assertTrue(self.tournament.manual_next_round_pending)
        self.assertEqual(self.tournament.current_round, 1)
        self.assertEqual(len(self.tournament.ongoing_games), 0)
        self.assertTrue(self.tournament.live_status()["manualNextRound"])

        self.assertTrue(await self.tournament.start_next_round_now(datetime.now(timezone.utc)))
        self.assertFalse(self.tournament.manual_next_round_pending)
        self.assertEqual(self.tournament.current_round, 2)
        self.assertGreater(len(self.tournament.ongoing_games), 0)

    async def test_fixed_round_standings_mark_ongoing_games_with_star(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=0, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        self.assertEqual(len(games), 1)

        players_json = self.tournament.players_json()
        star_marked_rows = [
            row
            for row in players_json["players"]
            if any(
                isinstance(point, tuple) and len(point) > 0 and point[0] == "*"
                for point in row["points"]
            )
        ]
        self.assertEqual(len(star_marked_rows), 2)

        for player_data in self.tournament.players.values():
            self.assertFalse(
                any(
                    isinstance(point, tuple) and len(point) > 0 and point[0] == "*"
                    for point in player_data.points
                )
            )

    async def test_fixed_round_players_remain_pairable_from_finished_game_socket(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = swiss_mod.SwissTournament(
            app_state, tid, variant="chess", before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        app_state.tourneysockets[tid] = {}

        class _DummyWs:
            def __init__(self):
                self.messages: list[dict[str, object]] = []

            async def send_str(self, payload: str) -> None:
                self.messages.append(json.loads(payload))

            async def close(self) -> None:
                return None

        lobby_ws = _DummyWs()
        players = []
        for suffix in ("A", "B", "C", "D"):
            user = User(app_state, username=f"fixed_round_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = {lobby_ws}
            app_state.tourneysockets[tid][user.username] = user.tournament_sockets[tid]
            await self.tournament.join(user)
            players.append(user)

        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_round_1 = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_round_1)
        self.assertEqual(len(games), 2)

        for game in games:
            game.result = "1-0"
            game.status = FLAG
            game.board.ply = 20
            await self.tournament.game_update(game)

        await asyncio.sleep(0)

        game_ws_by_user: dict[str, _DummyWs] = {}
        for game in games:
            for player in (game.wplayer, game.bplayer):
                game_ws = _DummyWs()
                game_ws_by_user[player.username] = game_ws
                player.tournament_sockets[tid] = set()
                app_state.tourneysockets[tid][player.username] = player.tournament_sockets[tid]
                player.game_sockets[game.id] = {game_ws}

        self.tournament.current_round = 2
        waiting_round_2 = list(self.tournament.waiting_players())
        self.assertEqual(
            {player.username for player in waiting_round_2},
            {player.username for player in players},
        )

        _, round_2_games = await self.tournament.create_new_pairings(waiting_round_2)
        self.assertEqual(len(round_2_games), 2)

        for player in players:
            player_data = self.tournament.player_data_by_name(player.username)
            self.assertIsNotNone(player_data)
            assert player_data is not None
            self.assertFalse(player_data.paused)
            self.assertTrue(
                any(
                    msg.get("type") == "new_game"
                    for msg in game_ws_by_user[player.username].messages
                )
            )

    async def test_rr_waiting_players_ignore_socket_presence(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state, tid, variant="chess", before_start=0, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))

        for player in self.tournament.players:
            player.tournament_sockets[self.tournament.id] = set()

        waiting_players = list(self.tournament.waiting_players())
        self.assertEqual(
            {player.username for player in waiting_players},
            {player.username for player in self.tournament.players},
        )

    async def test_swiss_ws_redirect_failure_does_not_pause_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = swiss_mod.SwissTournament(
            app_state, tid, variant="chess", before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament

        players = []
        for suffix in ("A", "B"):
            user = User(app_state, username=f"fixed_round_wsless_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            await self.tournament.join(user)
            players.append(user)

        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_players = list(self.tournament.waiting_players())
        self.assertEqual(
            {player.username for player in waiting_players},
            {player.username for player in players},
        )

        _, games = await self.tournament.create_new_pairings(waiting_players)
        self.assertEqual(len(games), 1)

        for player in players:
            player_data = self.tournament.player_data_by_name(player.username)
            self.assertIsNotNone(player_data)
            assert player_data is not None
            self.assertFalse(player_data.paused)
            self.assertFalse(player_data.withdrawn)
            self.assertFalse(player_data.free)

    async def test_arena_standings_do_not_mark_ongoing_games_with_star(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        self.assertEqual(len(games), 1)

        players_json = self.tournament.players_json()
        self.assertTrue(
            all(
                not any(
                    isinstance(point, tuple) and len(point) > 0 and point[0] == "*"
                    for point in row["points"]
                )
                for row in players_json["players"]
            )
        )

    async def test_fixed_round_standings_render_absent_as_dash(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        absent = list(self.tournament.players.keys())[0]
        await self.tournament.pause(absent)

        waiting_players = list(self.tournament.waiting_players())
        await self.tournament.create_new_pairings(waiting_players)

        players_json = self.tournament.players_json()
        absent_row = next(row for row in players_json["players"] if row["name"] == absent.username)
        self.assertEqual(absent_row["points"][-1], "-")

        absent_data = self.tournament.players[absent]
        self.assertEqual(absent_data.points[-1], (0, 0))

    async def test_tournament_rating_update_on_rejoin(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=1, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        player = list(self.tournament.players.keys())[0]
        initial_rating = self.tournament.players[player].rating

        await self.tournament.withdraw(player)

        # Simulate rating change
        new_rating = initial_rating + 100
        player.perfs["chess"]["gl"]["r"] = new_rating

        await self.tournament.join(player)

        self.assertEqual(self.tournament.players[player].rating, new_rating)

    async def test_tournament_sorting_before_start(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=1, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(3)

        players_json = self.tournament.players_json()
        leaderboard_ratings = [p["rating"] for p in players_json["players"]]

        self.assertEqual(leaderboard_ratings, sorted(leaderboard_ratings, reverse=True))

        # Add a new player with a higher rating
        await self.tournament.join_players(1, rating=2000)

        players_json = self.tournament.players_json()
        leaderboard_ratings = [p["rating"] for p in players_json["players"]]
        self.assertEqual(leaderboard_ratings, sorted(leaderboard_ratings, reverse=True))

    async def test_withdraw_after_start_pauses(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(2)
        player = list(self.tournament.players.keys())[0]
        await self.tournament.start(datetime.now(timezone.utc))

        await self.tournament.withdraw(player)

        player_data = self.tournament.players[player]
        self.assertTrue(player_data.paused)
        self.assertFalse(player_data.withdrawn)
        self.assertEqual(self.tournament.nb_players, 2)
        self.assertIn(player, self.tournament.leaderboard)

        doc = await app_state.db.tournament_player.find_one({"_id": player_data.id})
        self.assertTrue(doc["a"])
        self.assertFalse(doc.get("wd", False))

    async def test_tournament_handles_replaced_user_instance(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        app_state.tourneysockets[tid] = {}
        await self.tournament.join_players(1)

        original_player = list(self.tournament.players.keys())[0]
        username = original_player.username

        replacement = User(
            app_state,
            username=username,
            title=original_player.title,
            perfs=original_player.perfs,
        )
        app_state.users[username] = replacement
        replacement.tournament_sockets[tid] = set((None,))
        app_state.tourneysockets[tid][username] = replacement.tournament_sockets[tid]

        self.assertEqual(len(self.tournament.waiting_players()), 1)

        games = await self.tournament.games_json(username)
        self.assertEqual(games["name"], username)
        self.assertEqual(games["rank"], 1)

    async def test_update_players_handles_replaced_user_instance(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)

        white = list(self.tournament.players.keys())[0]
        black = list(self.tournament.players.keys())[1]

        replacement_black = User(
            app_state,
            username=black.username,
            title=black.title,
            perfs=black.perfs,
        )
        app_state.users[black.username] = replacement_black

        game = GameData(
            "syntheticGame",
            white.username,
            str(self.tournament.players[white].rating),
            replacement_black.username,
            str(self.tournament.players[black].rating),
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            wtitle=white.title,
            btitle=replacement_black.title,
        )
        self.tournament.update_players(game)

        black_data = self.tournament.player_data_by_name(black.username)
        self.assertIsNotNone(black_data)
        assert black_data is not None
        self.assertEqual(len(self.tournament.players[white].games), 1)
        self.assertEqual(len(black_data.games), 1)
        self.assertEqual(game.bplayer.username, black.username)

    async def test_player_name_index_rebuilds_from_user_key_map(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        original_player = list(self.tournament.players.keys())[0]
        original_data = self.tournament.players[original_player]
        username = original_player.username

        self.tournament.players_by_name.clear()
        self.tournament.player_keys_by_name.clear()

        rebuilt_player = self.tournament.get_player_by_name(username)
        self.assertIs(rebuilt_player, original_player)
        self.assertIs(self.tournament.player_data_by_name(username), original_data)

    async def test_gamedata_with_username_only_values(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)

        white = list(self.tournament.players.keys())[0]
        black = list(self.tournament.players.keys())[1]

        game = GameData(
            "syntheticGameByName",
            white.username,
            str(self.tournament.players[white].rating),
            black.username,
            str(self.tournament.players[black].rating),
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            wtitle=white.title,
            btitle=black.title,
        )
        self.tournament.update_players(game)

        self.assertEqual(game.wplayer.username, white.username)
        self.assertEqual(game.bplayer.username, black.username)

        black_view = game.game_json(black)
        self.assertEqual(black_view["color"], "b")
        self.assertEqual(black_view["name"], white.username)
        self.assertEqual(black_view["title"], white.title)

    async def test_players_json_and_waiting_players_tolerate_stale_player_key(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        player = list(self.tournament.players.keys())[0]
        player_data = self.tournament.players.pop(player)
        self.tournament.players_by_name[player.username] = player_data
        self.tournament.player_keys_by_name.pop(player.username, None)

        waiting = self.tournament.waiting_players()
        self.assertEqual(len(waiting), 1)
        self.assertEqual(waiting[0].username, player.username)

        page = self.tournament.players_json()
        self.assertEqual(len(page["players"]), 1)
        self.assertEqual(page["players"][0]["name"], player.username)

    async def test_get_player_by_name_recovers_from_players_key_drift(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)

        white = list(self.tournament.players.keys())[0]
        black = list(self.tournament.players.keys())[1]
        black_data = self.tournament.players.pop(black)
        self.tournament.players_by_name[black.username] = black_data
        self.tournament.player_keys_by_name.pop(black.username, None)

        game = GameData(
            "syntheticRecoveredByName",
            white.username,
            str(self.tournament.players[white].rating),
            black.username,
            str(black_data.rating),
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
        )
        self.tournament.update_players(game)

        recovered_black = self.tournament.get_player_by_name(black.username)
        self.assertIsNotNone(recovered_black)
        assert recovered_black is not None
        self.assertIn(recovered_black, self.tournament.players)
        self.assertEqual(len(self.tournament.players[recovered_black].games), 1)
        self.assertEqual(game.bplayer.username, black.username)

    async def test_join_with_replaced_user_does_not_duplicate_leaderboard_entry(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=10, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        original = list(self.tournament.players.keys())[0]
        username = original.username
        player_data = self.tournament.players.pop(original)
        self.tournament.players_by_name[username] = player_data
        self.tournament.player_keys_by_name.pop(username, None)

        replacement = User(
            app_state,
            username=username,
            title=original.title,
            perfs=original.perfs,
        )
        app_state.users[username] = replacement
        new_rating = int(player_data.rating) + 25
        replacement.perfs["chess960"]["gl"]["r"] = new_rating

        await self.tournament.join(replacement)

        leaderboard_entries = [p for p in self.tournament.leaderboard if p.username == username]
        self.assertEqual(len(leaderboard_entries), 1)
        self.assertEqual(self.tournament.nb_players, 1)
        updated = self.tournament.player_data_by_name(username)
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.rating, new_rating)

    async def test_get_player_by_name_recovers_without_user_cache_entry(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        player = list(self.tournament.players.keys())[0]
        username = player.username
        player_data = self.tournament.players.pop(player)
        self.tournament.players_by_name[username] = player_data
        self.tournament.player_keys_by_name.pop(username, None)
        app_state.users.data.pop(username, None)

        recovered_player = self.tournament.get_player_by_name(username)
        self.assertIsNotNone(recovered_player)
        assert recovered_player is not None
        self.assertEqual(recovered_player.username, username)
        self.assertIn(recovered_player, self.tournament.players)
        self.assertIs(self.tournament.players[recovered_player], player_data)

    async def test_game_update_handles_stale_user_key_without_user_cache_entry(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = ArenaTestTournament(
            app_state, tid, variant="chess960", before_start=0, minutes=10, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        await self.tournament.join_players(2)
        await self.tournament.start(datetime.now(timezone.utc))

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]

        stale_player = game.bplayer
        stale_data = self.tournament.players.pop(stale_player)
        self.tournament.players_by_name[stale_player.username] = stale_data
        self.tournament.player_keys_by_name.pop(stale_player.username, None)
        app_state.users.data.pop(stale_player.username, None)

        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20

        await self.tournament.game_update(game)

        repaired_data = self.tournament.player_data_by_name(stale_player.username)
        self.assertIsNotNone(repaired_data)
        assert repaired_data is not None
        self.assertEqual(len(repaired_data.points), 1)
        self.assertEqual(self.tournament.nb_games_finished, 1)

        stale_doc = await app_state.db.tournament_player.find_one(
            {"tid": tid, "uid": stale_player.username}
        )
        self.assertIsNotNone(stale_doc)
        assert stale_doc is not None
        self.assertEqual(len(stale_doc["p"]), 1)
