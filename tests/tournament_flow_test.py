# -*- coding: utf-8 -*-

import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone

from const import FLAG, T_CREATED, T_FINISHED, T_STARTED
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament import swiss as swiss_mod
from tournament.auto_play_tournament import (
    ArenaTestTournament,
    RRTestTournament,
    SwissTestTournament,
)
from tournament.rr import ARR_STATUS_PENDING, ARR_STATUS_STARTED
from tournament.tournament import MANUAL_ROUND_INTERVAL, GameData, upsert_tournament_to_db
from tournament_test_base import ONE_TEST_ONLY, TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


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
            rounds=0,
            rr_max_players=6,
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
    async def test_rr_start_creates_full_arrangement_matrix(self):
        app_state = get_app_state(self.app)
        NB_PLAYERS = 5

        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=10,
            rounds=0,
            rr_max_players=NB_PLAYERS,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(NB_PLAYERS)
        await self.tournament.start(datetime.now(timezone.utc))

        self.assertEqual(self.tournament.status, T_STARTED)
        self.assertEqual(self.tournament.rounds, NB_PLAYERS)
        self.assertEqual(len(self.tournament.arrangements), 10)
        payload = self.tournament.arrangement_payload()
        self.assertEqual(payload["totalGames"], 10)
        self.assertEqual(payload["completedGames"], 0)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_rr_prestart_payload_exposes_projected_arrangements(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=10,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)

        payload = self.tournament.arrangement_payload()
        self.assertEqual(payload["totalGames"], 3)
        self.assertEqual(
            payload["players"], [player.username for player in self.tournament.leaderboard]
        )
        matrix = payload["matrix"]
        first = next(iter(payload["players"]))
        self.assertTrue(any(cell.get("id") for cell in matrix[first].values()))

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_rr_prestart_payload_handles_two_joined_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=10,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)

        payload = self.tournament.arrangement_payload()
        self.assertEqual(payload["totalGames"], 1)
        self.assertEqual(
            payload["players"], [player.username for player in self.tournament.leaderboard]
        )
        first, second = payload["players"]
        self.assertEqual(payload["matrix"][first][second]["round"], 1)

    @unittest.skipIf(ONE_TEST_ONLY, "1 test only")
    async def test_rr_finishes_on_minutes_deadline_with_incomplete_arrangements(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            before_start=0.01,
            rounds=0,
            rr_max_players=6,
            minutes=0.001,
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(5)

        if self.tournament.clock_task is not None:
            await asyncio.wait_for(self.tournament.clock_task, timeout=20)

        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(len(self.tournament.arrangements), 10)
        self.assertFalse(self.tournament.all_arrangements_finished())

    async def test_fixed_round_manual_next_round_waits_for_organizer(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
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
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=6,
            with_clock=False,
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

    async def test_rr_join_refuses_players_beyond_max_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=10,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(10)
        self.assertEqual(self.tournament.nb_players, 10)
        self.assertEqual(len(self.tournament.players), 10)

        extra = User(app_state, username=f"{tid}_extra", perfs=make_test_perfs())
        extra.tournament_sockets[self.tournament.id] = set((None,))
        app_state.users[extra.username] = extra
        self.assertEqual(await self.tournament.join(extra), "This round-robin tournament is full.")

    async def test_rr_start_derives_rounds_from_joined_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=10,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(5)
        await self.tournament.start(datetime.now(timezone.utc))
        self.assertEqual(self.tournament.rounds, 5)

        tid_even = id8()
        even_tournament = RRTestTournament(
            app_state,
            tid_even,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=10,
            with_clock=False,
        )
        app_state.tournaments[tid_even] = even_tournament

        await even_tournament.join_players(4)
        await even_tournament.start(datetime.now(timezone.utc))
        self.assertEqual(even_tournament.rounds, 3)

    async def test_rr_late_join_is_closed_after_start(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=10,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))

        late = User(app_state, username=f"{tid}_late", perfs=make_test_perfs())
        late.tournament_sockets[self.tournament.id] = set((None,))
        app_state.users[late.username] = late

        self.assertEqual(
            await self.tournament.join(late),
            "Late join is closed for this round-robin tournament.",
        )

        self.assertEqual(self.tournament.nb_players, 4)
        self.assertEqual(len(self.tournament.players), 4)

    async def test_rr_join_request_requires_organizer_approval_when_enabled(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=8,
            rr_requires_approval=True,
            with_clock=False,
        )
        self.tournament.created_by = "rr_host"
        app_state.tournaments[tid] = self.tournament

        organizer = User(app_state, username="rr_host", perfs=make_test_perfs())
        app_state.users[organizer.username] = organizer

        applicant = User(app_state, username=f"{tid}_pending", perfs=make_test_perfs())
        applicant.tournament_sockets[self.tournament.id] = set((None,))
        app_state.users[applicant.username] = applicant

        self.assertEqual(await self.tournament.join(applicant), "JOIN_REQUESTED")
        self.assertEqual(self.tournament.user_status(applicant), "pending")
        self.assertIn(applicant.username, self.tournament.rr_pending_players)
        self.assertEqual(self.tournament.nb_players, 0)

        self.assertIsNone(await self.tournament.rr_approve_player(applicant.username))
        self.assertEqual(self.tournament.user_status(applicant), "joined")
        self.assertNotIn(applicant.username, self.tournament.rr_pending_players)
        self.assertEqual(self.tournament.nb_players, 1)

    async def test_rr_joining_can_be_closed_and_reopened_by_organizer(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=8,
            with_clock=False,
        )
        self.tournament.created_by = "rr_host"
        app_state.tournaments[tid] = self.tournament

        organizer = User(app_state, username="rr_host", perfs=make_test_perfs())
        app_state.users[organizer.username] = organizer

        applicant = User(app_state, username=f"{tid}_closed", perfs=make_test_perfs())
        app_state.users[applicant.username] = applicant

        self.assertIsNone(await self.tournament.rr_set_joining_closed(True))
        self.assertTrue(self.tournament.rr_joining_closed)
        self.assertEqual(
            await self.tournament.join(applicant),
            "Joining is currently closed for this round-robin tournament.",
        )
        self.assertEqual(self.tournament.nb_players, 0)

        self.assertIsNone(await self.tournament.rr_set_joining_closed(False))
        self.assertFalse(self.tournament.rr_joining_closed)
        self.assertIsNone(await self.tournament.join(applicant))
        self.assertEqual(self.tournament.nb_players, 1)

    async def test_rr_challenge_creates_notification_for_opponent(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement = next(
            arr for arr in self.tournament.arrangement_list() if arr.involves(users[0].username)
        )
        challenger = next(user for user in users if user.username == arrangement.white)
        opponent_name = arrangement.black
        opponent = app_state.users[opponent_name]

        self.assertIsNone(
            await self.tournament.create_arrangement_challenge(challenger, arrangement.id)
        )
        self.assertIsNotNone(opponent.notifications)
        assert opponent.notifications is not None
        self.assertEqual(opponent.notifications[-1]["type"], "rrChallenge")
        self.assertEqual(opponent.notifications[-1]["content"]["tid"], tid)
        self.assertEqual(opponent.notifications[-1]["content"]["arr"], arrangement.id)
        self.assertEqual(opponent.notifications[-1]["content"]["opp"], challenger.username)

    async def test_rr_prestart_challenge_survives_start(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=10,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        payload = self.tournament.arrangement_payload()
        arrangement_id = next(
            cell["id"]
            for row in payload["matrix"].values()
            for cell in row.values()
            if cell["id"] and cell["white"] == users[0].username
        )
        self.assertIsNone(
            await self.tournament.create_arrangement_challenge(users[0], arrangement_id)
        )

        arrangement_before = self.tournament.arrangement_by_id(arrangement_id)
        assert arrangement_before is not None
        self.assertEqual(arrangement_before.status, "challenged")
        self.assertIsNotNone(arrangement_before.invite_id)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement_after = self.tournament.arrangement_by_id(arrangement_id)
        assert arrangement_after is not None
        self.assertEqual(arrangement_after.status, "challenged")
        self.assertEqual(arrangement_after.invite_id, arrangement_before.invite_id)

    async def test_rr_scheduling_sets_player_proposals_and_agreed_time(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement = next(
            arr for arr in self.tournament.arrangement_list() if arr.involves(users[0].username)
        )
        white = next(user for user in users if user.username == arrangement.white)
        black = next(user for user in users if user.username == arrangement.black)

        proposed = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1)
        self.assertIsNone(
            await self.tournament.set_arrangement_time(white, arrangement.id, proposed)
        )
        self.assertEqual(arrangement.white_date, proposed)
        self.assertIsNone(arrangement.scheduled_at)

        agreed = proposed + timedelta(seconds=45)
        self.assertIsNone(await self.tournament.set_arrangement_time(black, arrangement.id, agreed))
        self.assertEqual(arrangement.black_date, agreed)
        self.assertEqual(arrangement.scheduled_at, proposed)

    async def test_rr_scheduling_clears_agreement_when_player_changes_time(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement = next(
            arr for arr in self.tournament.arrangement_list() if arr.involves(users[0].username)
        )
        white = next(user for user in users if user.username == arrangement.white)
        black = next(user for user in users if user.username == arrangement.black)

        proposed = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=2)
        self.assertIsNone(
            await self.tournament.set_arrangement_time(white, arrangement.id, proposed)
        )
        self.assertIsNone(
            await self.tournament.set_arrangement_time(
                black, arrangement.id, proposed + timedelta(seconds=30)
            )
        )
        self.assertEqual(arrangement.scheduled_at, proposed)

        later = proposed + timedelta(hours=2)
        self.assertIsNone(await self.tournament.set_arrangement_time(white, arrangement.id, later))
        self.assertEqual(arrangement.white_date, later)
        self.assertIsNone(arrangement.scheduled_at)

    async def test_rr_prestart_scheduling_survives_start(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=10,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        arrangement_id = next(
            cell["id"]
            for row in self.tournament.arrangement_payload()["matrix"].values()
            for cell in row.values()
            if cell["id"] and cell["white"] == users[0].username
        )
        proposed = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=3)
        self.assertIsNone(
            await self.tournament.set_arrangement_time(users[0], arrangement_id, proposed)
        )

        arrangement_before = self.tournament.arrangement_by_id(arrangement_id)
        assert arrangement_before is not None
        self.assertEqual(arrangement_before.white_date, proposed)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement_after = self.tournament.arrangement_by_id(arrangement_id)
        assert arrangement_after is not None
        self.assertEqual(arrangement_after.white_date, proposed)

    async def test_rr_arrangement_reminders_fire_for_agreed_games(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=0,
            rounds=0,
            rr_max_players=4,
            with_clock=False,
        )
        app_state.tournaments[tid] = self.tournament

        users = []
        for suffix in ("A", "B", "C"):
            user = User(app_state, username=f"{tid}_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)

        await self.tournament.start(datetime.now(timezone.utc))

        arrangement = next(
            arr for arr in self.tournament.arrangement_list() if arr.involves(users[0].username)
        )
        arrangement.scheduled_at = datetime.now(timezone.utc) + timedelta(hours=23, minutes=30)
        arrangement.date = datetime.now(timezone.utc) - timedelta(hours=4)

        await self.tournament.send_arrangement_reminders(datetime.now(timezone.utc))

        for user in (app_state.users[arrangement.white], app_state.users[arrangement.black]):
            self.assertIsNotNone(user.notifications)
            assert user.notifications is not None
            self.assertEqual(user.notifications[-1]["type"], "rrArrangementReminder")
            self.assertEqual(user.notifications[-1]["content"]["arr"], arrangement.id)

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

    async def test_rr_aborted_arrangement_game_reopens_pairing(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = RRTestTournament(
            app_state, tid, before_start=0, rounds=1, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        players = []
        for suffix in ("A", "B"):
            user = User(app_state, username=f"rr_abort_{suffix}", perfs=make_test_perfs())
            app_state.users[user.username] = user
            await self.tournament.join(user)
            players.append(user)

        await self.tournament.start(datetime.now(timezone.utc))
        arrangement = next(iter(self.tournament.arrangements.values()))

        seek_error = await self.tournament.create_arrangement_challenge(players[0], arrangement.id)
        self.assertIsNone(seek_error)
        accept_result = await self.tournament.accept_arrangement_challenge(
            players[1], arrangement.id
        )
        self.assertEqual(accept_result["type"], "new_game")

        game = app_state.games[accept_result["gameId"]]
        self.assertEqual(arrangement.status, ARR_STATUS_STARTED)
        self.assertEqual(arrangement.game_id, game.id)

        await game.game_ended(game.wplayer, "abort")

        self.assertEqual(arrangement.status, ARR_STATUS_PENDING)
        self.assertIsNone(arrangement.game_id)
        self.assertIsNone(arrangement.invite_id)
        self.assertIsNone(arrangement.challenger)
        self.assertIsNone(arrangement.scheduled_at)
