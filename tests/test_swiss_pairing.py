import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from importlib.util import find_spec
import os
from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
from unittest.mock import patch

from const import FLAG, TEST_PREFIX, T_FINISHED
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_arena import SwissTestTournament
from tournament import swiss as swiss_mod
from tournament import tournaments as tournaments_mod
from tournament.tournament import (
    AUTO_ROUND_INTERVAL,
    ByeGame,
    GameData,
    PairingUnavailable,
    SCORE_SHIFT,
    upsert_tournament_to_db,
)
from tournament_test_base import TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


def _has_swisspairing_runtime() -> bool:
    if find_spec("swisspairing") is not None:
        return True
    raw_src = os.getenv("SWISSPAIRING_SRC", "").strip()
    return raw_src != "" and Path(raw_src).expanduser().exists()


class SwissPairingTestCase(TournamentTestCase):
    @staticmethod
    def _normalized_pairing_usernames(
        pairing: list[tuple[User, User]],
    ) -> list[tuple[str, str]]:
        normalized = [(white.username, black.username) for white, black in pairing]
        normalized.sort(key=lambda pair: (min(pair), max(pair), pair[0], pair[1]))
        return normalized

    def _rollback_transient_byes(
        self,
        tournament: SwissTestTournament,
        *,
        bye_players: list[User],
    ) -> None:
        for player in bye_players:
            player_data = tournament.player_data_by_name(player.username)
            self.assertIsNotNone(player_data)
            assert player_data is not None
            self.assertTrue(player_data.games)
            self.assertTrue(player_data.points)
            player_data.games.pop()
            player_data.points.pop()

        tournament.bye_players = []

    def _pairing_outcome_for_backend(
        self,
        tournament: SwissTestTournament,
        *,
        backend: str,
        keep_byes: bool = False,
    ) -> tuple[list[tuple[str, str]], list[str]]:
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": backend}):
            tournament.bye_players = []
            pairing = tournament.create_pairing(list(tournament.waiting_players()))

        bye_players = list(tournament.bye_players)
        bye_usernames = sorted(player.username for player in bye_players)
        if bye_players and not keep_byes:
            self._rollback_transient_byes(tournament, bye_players=bye_players)
        return self._normalized_pairing_usernames(pairing), bye_usernames

    def _assert_backend_outcome_match(
        self,
        tournament: SwissTestTournament,
        *,
        round_number: int,
        keep_swisspairing_byes: bool = False,
    ) -> tuple[list[tuple[str, str]], list[str]]:
        py4swiss_pairing, py4swiss_byes = self._pairing_outcome_for_backend(
            tournament,
            backend="py4swiss",
        )
        swisspairing_pairing, swisspairing_byes = self._pairing_outcome_for_backend(
            tournament,
            backend="swisspairing",
            keep_byes=keep_swisspairing_byes,
        )

        self.assertEqual(
            swisspairing_pairing,
            py4swiss_pairing,
            msg=f"backend mismatch in round {round_number}",
        )
        self.assertEqual(
            swisspairing_byes,
            py4swiss_byes,
            msg=f"bye mismatch in round {round_number}",
        )

        return py4swiss_pairing, py4swiss_byes

    def _record_finished_round(
        self,
        tournament: SwissTestTournament,
        *,
        round_number: int,
        pairing: list[tuple[str, str]],
    ) -> None:
        result_cycle = ("1-0", "0-1", "1/2-1/2", "1-0", "0-1")
        base_time = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)

        for board_index, (white_name, black_name) in enumerate(pairing):
            white_user = tournament.get_player_by_name(white_name)
            black_user = tournament.get_player_by_name(black_name)
            self.assertIsNotNone(white_user)
            self.assertIsNotNone(black_user)
            assert white_user is not None
            assert black_user is not None

            white_data = tournament.player_data_by_name(white_name)
            black_data = tournament.player_data_by_name(black_name)
            self.assertIsNotNone(white_data)
            self.assertIsNotNone(black_data)
            assert white_data is not None
            assert black_data is not None

            game = GameData(
                f"swiss_soak_r{round_number}_b{board_index}",
                white_name,
                str(white_data.rating),
                black_name,
                str(black_data.rating),
                result_cycle[(round_number + board_index) % len(result_cycle)],
                base_time + timedelta(minutes=round_number * 10 + board_index),
                False,
                False,
                round_no=round_number,
            )

            tournament.update_players(game)
            wpoint, bpoint, _wperf, _bperf = tournament.points_perfs(game)

            white_data.points.append(wpoint)
            black_data.points.append(bpoint)

            white_score = tournament.leaderboard_score_by_username(white_name) // SCORE_SHIFT
            black_score = tournament.leaderboard_score_by_username(black_name) // SCORE_SHIFT
            tournament.set_leaderboard_score_by_username(
                white_name,
                tournament.compose_leaderboard_score(
                    white_score + int(wpoint[0]),
                    white_data,
                ),
                player=white_user,
            )
            tournament.set_leaderboard_score_by_username(
                black_name,
                tournament.compose_leaderboard_score(
                    black_score + int(bpoint[0]),
                    black_data,
                ),
                player=black_user,
            )

        tournament.recalculate_berger_tiebreak()

    async def _finish_created_games(
        self,
        tournament: SwissTestTournament,
        games: list,
        *,
        result: str = "1-0",
    ) -> None:
        for game in games:
            game.result = result
            game.status = FLAG
            game.board.ply = 20
            await tournament.game_update(game)

        await asyncio.sleep(0)

    def test_load_swisspairing_runtime_uses_src_env_fallback(self):
        marker = object()
        original_sys_path = list(swiss_mod.sys.path)

        with TemporaryDirectory() as temp_dir:
            fake_modules = {
                "swisspairing": SimpleNamespace(
                    map_plan_to_users=marker,
                    pair_snapshots_dutch=marker,
                ),
                "swisspairing.exceptions": SimpleNamespace(PairingError=ValueError),
                "swisspairing.model": SimpleNamespace(FloatKind=marker),
                "swisspairing.pychess_adapter": SimpleNamespace(PychessPlayerSnapshot=marker),
            }

            def fake_import_module(name: str):
                if name == "swisspairing" and temp_dir not in swiss_mod.sys.path:
                    raise ModuleNotFoundError("swisspairing")
                return fake_modules[name]

            try:
                swiss_mod.sys.path[:] = [entry for entry in swiss_mod.sys.path if entry != temp_dir]
                with (
                    patch.dict("os.environ", {"SWISSPAIRING_SRC": temp_dir}),
                    patch(
                        "tournament.swiss.importlib.import_module", side_effect=fake_import_module
                    ),
                ):
                    (
                        map_plan_to_users,
                        pair_snapshots_dutch,
                        pairing_error,
                        float_kind,
                        snapshot_cls,
                        import_error,
                    ) = swiss_mod._load_swisspairing_runtime()
            finally:
                swiss_mod.sys.path[:] = original_sys_path

        self.assertIsNone(import_error)
        self.assertIs(map_plan_to_users, marker)
        self.assertIs(pair_snapshots_dutch, marker)
        self.assertIs(pairing_error, ValueError)
        self.assertIs(float_kind, marker)
        self.assertIs(snapshot_cls, marker)

    async def test_automatic_round_interval_is_clamped(self):
        app_state = get_app_state(self.app)

        fast = SwissTestTournament(
            app_state,
            id8(),
            base=0.25,
            inc=0,
            rounds=3,
            round_interval=AUTO_ROUND_INTERVAL,
            with_clock=False,
        )
        self.assertEqual(fast.effective_round_interval_seconds(), 10)

        slow = SwissTestTournament(
            app_state,
            id8(),
            base=60,
            inc=60,
            rounds=3,
            round_interval=AUTO_ROUND_INTERVAL,
            with_clock=False,
        )
        self.assertEqual(slow.effective_round_interval_seconds(), 60)

    async def test_manual_round_interval_is_used(self):
        app_state = get_app_state(self.app)
        tournament = SwissTestTournament(
            app_state,
            id8(),
            rounds=3,
            round_interval=300,
            with_clock=False,
        )
        self.assertEqual(tournament.effective_round_interval_seconds(), 300)

    async def test_create_pairing_raises_when_py4swiss_is_unavailable(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        with patch("tournament.swiss.DutchEngine", None):
            with self.assertRaisesRegex(RuntimeError, "requires py4swiss"):
                self.tournament.create_pairing(waiting)

    async def test_create_pairing_uses_dutch_engine_output(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        users_by_id = {index: user for index, user in enumerate(waiting, start=1)}
        fake_state = SimpleNamespace(
            trf=object(),
            waiting_ids=set(users_by_id),
            users_by_id=users_by_id,
        )

        class _Engine:
            @staticmethod
            def generate_pairings(_trf):
                return [
                    SimpleNamespace(white=1, black=2),
                    SimpleNamespace(white=3, black=4),
                ]

        with (
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss.DutchEngine", _Engine),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1]), (waiting[2], waiting[3])])
        self.assertEqual(self.tournament.bye_players, [])

    async def test_create_pairing_uses_swisspairing_backend_output(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        fake_plan = SimpleNamespace(
            pairings=(
                (waiting[0].username, waiting[1].username),
                (waiting[2].username, waiting[3].username),
            ),
            bye_usernames=(),
        )
        fake_user_pairings = ((waiting[0], waiting[1]), (waiting[2], waiting[3]))

        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}),
            patch("tournament.swiss._build_swisspairing_snapshots", return_value=()),
            patch("tournament.swiss.pair_snapshots_dutch", return_value=fake_plan),
            patch(
                "tournament.swiss.map_plan_to_users",
                return_value=(fake_user_pairings, ()),
            ),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1]), (waiting[2], waiting[3])])
        self.assertEqual(self.tournament.bye_players, [])

    async def test_create_pairing_uses_swisspairing_backend_without_py4swiss(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)

        waiting = list(self.tournament.waiting_players())
        fake_plan = SimpleNamespace(
            pairings=((waiting[0].username, waiting[1].username),),
            bye_usernames=(waiting[2].username,),
        )
        fake_user_pairings = ((waiting[0], waiting[1]),)

        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}),
            patch("tournament.swiss.ParsedTrf", None),
            patch("tournament.swiss._build_swisspairing_snapshots", return_value=()),
            patch("tournament.swiss.pair_snapshots_dutch", return_value=fake_plan),
            patch(
                "tournament.swiss.map_plan_to_users",
                return_value=(fake_user_pairings, (waiting[2],)),
            ),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1])])
        self.assertEqual(self.tournament.bye_players, [waiting[2]])

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend smoke test",
    )
    async def test_create_pairing_uses_real_swisspairing_backend_for_initial_round(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(len(pairing), 2)
        seen_names = {player.username for pair in pairing for player in pair}
        self.assertEqual(seen_names, {player.username for player in waiting})
        self.assertEqual(self.tournament.bye_players, [])

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend parity test",
    )
    async def test_real_swisspairing_backend_matches_py4swiss_over_four_rounds(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=4, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(10)

        for round_number in range(1, 5):
            self.tournament.current_round = round_number

            py4swiss_pairing, py4swiss_byes = self._assert_backend_outcome_match(
                self.tournament,
                round_number=round_number,
            )
            self.assertEqual(py4swiss_byes, [])

            self._record_finished_round(
                self.tournament,
                round_number=round_number,
                pairing=py4swiss_pairing,
            )

        self.assertEqual(
            [len(player.games) for player in self.tournament.players.values()],
            10 * [4],
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend parity test",
    )
    async def test_real_swisspairing_backend_matches_py4swiss_over_four_rounds_with_byes(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=4, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(9)

        for round_number in range(1, 5):
            self.tournament.current_round = round_number

            py4swiss_pairing, py4swiss_byes = self._assert_backend_outcome_match(
                self.tournament,
                round_number=round_number,
                keep_swisspairing_byes=True,
            )

            await self.tournament.persist_byes()
            self._record_finished_round(
                self.tournament,
                round_number=round_number,
                pairing=py4swiss_pairing,
            )

        round_entries = [
            len(self.tournament.player_data_by_name(player.username).games)
            for player in self.tournament.players.values()
        ]
        self.assertEqual(round_entries, 9 * [4])

        total_byes = sum(
            sum(
                isinstance(game, ByeGame)
                for game in self.tournament.player_data_by_name(player.username).games
            )
            for player in self.tournament.players.values()
        )
        self.assertEqual(total_byes, 4)

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend parity test",
    )
    async def test_real_swisspairing_backend_matches_py4swiss_after_late_join(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(5)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        round_1_pairing, round_1_byes = self._assert_backend_outcome_match(
            self.tournament,
            round_number=1,
            keep_swisspairing_byes=True,
        )
        self.assertEqual(len(round_1_byes), 1)

        await self.tournament.persist_byes()
        self._record_finished_round(
            self.tournament,
            round_number=1,
            pairing=round_1_pairing,
        )

        late = User(app_state, username="late_join_backend_parity")
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))

        join_error = await self.tournament.join(late)
        self.assertIsNone(join_error)

        late_data = self.tournament.player_data_by_name(late.username)
        self.assertIsNotNone(late_data)
        assert late_data is not None
        self.assertEqual(late_data.joined_round, 2)
        self.assertEqual([getattr(game, "token", "") for game in late_data.games], ["H"])

        self.tournament.current_round = 2
        round_2_pairing, round_2_byes = self._assert_backend_outcome_match(
            self.tournament,
            round_number=2,
        )
        self.assertEqual(round_2_byes, [])
        self.assertIn(
            late.username,
            {player_name for pair in round_2_pairing for player_name in pair},
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend parity test",
    )
    async def test_real_backends_match_after_late_join_reload(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(5)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        round_1_pairing, round_1_byes = self._assert_backend_outcome_match(
            self.tournament,
            round_number=1,
            keep_swisspairing_byes=True,
        )
        self.assertEqual(len(round_1_byes), 1)

        await self.tournament.persist_byes()
        self._record_finished_round(
            self.tournament,
            round_number=1,
            pairing=round_1_pairing,
        )

        late = User(app_state, username="late_join_backend_reload", perfs=make_test_perfs())
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))

        join_error = await self.tournament.join(late)
        self.assertIsNone(join_error)

        self.tournament.current_round = 2
        await self.tournament.save_current_round()

        _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
            app_state.db_client,
            tid,
        )
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None

        reloaded_late = reloaded_tournament.player_data_by_name(late.username)
        self.assertIsNotNone(reloaded_late)
        assert reloaded_late is not None
        self.assertEqual(reloaded_late.joined_round, 2)
        self.assertEqual([getattr(game, "token", "") for game in reloaded_late.games], ["H"])

        round_2_pairing, round_2_byes = self._assert_backend_outcome_match(
            reloaded_tournament,
            round_number=2,
        )
        self.assertEqual(round_2_byes, [])
        self.assertIn(
            late.username,
            {player_name for pair in round_2_pairing for player_name in pair},
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live backend parity test",
    )
    async def test_real_backends_handle_withdraw_pause_after_round_one(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(6)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        round_1_pairing, round_1_byes = self._assert_backend_outcome_match(
            self.tournament,
            round_number=1,
        )
        self.assertEqual(round_1_byes, [])
        self._record_finished_round(
            self.tournament,
            round_number=1,
            pairing=round_1_pairing,
        )

        withdrawn = self.tournament.get_player_by_name(f"{TEST_PREFIX}User_6")
        self.assertIsNotNone(withdrawn)
        assert withdrawn is not None

        await self.tournament.withdraw(withdrawn)

        withdrawn_data = self.tournament.player_data_by_name(withdrawn.username)
        self.assertIsNotNone(withdrawn_data)
        assert withdrawn_data is not None
        self.assertTrue(withdrawn_data.paused)
        self.assertFalse(withdrawn_data.withdrawn)

        waiting_usernames = {player.username for player in self.tournament.waiting_players()}
        self.assertNotIn(withdrawn.username, waiting_usernames)

        self.tournament.current_round = 2
        py4swiss_pairing, py4swiss_byes = self._pairing_outcome_for_backend(
            self.tournament,
            backend="py4swiss",
        )
        swisspairing_pairing, swisspairing_byes = self._pairing_outcome_for_backend(
            self.tournament,
            backend="swisspairing",
            keep_byes=True,
        )

        for pairing, byes in (
            (py4swiss_pairing, py4swiss_byes),
            (swisspairing_pairing, swisspairing_byes),
        ):
            self.assertEqual(len(pairing), 2)
            self.assertEqual(len(byes), 1)
            scheduled_usernames = {player_name for pair in pairing for player_name in pair}
            scheduled_usernames.update(byes)
            self.assertEqual(len(scheduled_usernames), 5)
            self.assertNotIn(withdrawn.username, scheduled_usernames)

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss reload flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_handles_withdraw_pause_after_reload(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(6)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        round_1_pairing, round_1_byes = self._assert_backend_outcome_match(
            self.tournament,
            round_number=1,
        )
        self.assertEqual(round_1_byes, [])
        self._record_finished_round(
            self.tournament,
            round_number=1,
            pairing=round_1_pairing,
        )

        withdrawn = self.tournament.get_player_by_name(f"{TEST_PREFIX}User_6")
        self.assertIsNotNone(withdrawn)
        assert withdrawn is not None
        await self.tournament.withdraw(withdrawn)

        self.tournament.current_round = 2
        await self.tournament.save_current_round()

        _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
            app_state.db_client,
            tid,
        )
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None

        reloaded_withdrawn = reloaded_tournament.get_player_by_name(withdrawn.username)
        self.assertIsNotNone(reloaded_withdrawn)
        assert reloaded_withdrawn is not None
        reloaded_withdrawn_data = reloaded_tournament.player_data_by_name(withdrawn.username)
        self.assertIsNotNone(reloaded_withdrawn_data)
        assert reloaded_withdrawn_data is not None
        self.assertTrue(reloaded_withdrawn_data.paused)
        self.assertFalse(reloaded_withdrawn_data.withdrawn)

        waiting_before_round_2 = {
            player.username for player in reloaded_tournament.waiting_players()
        }
        self.assertNotIn(withdrawn.username, waiting_before_round_2)

        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await reloaded_tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)

        round_2_games = list(reloaded_tournament.ongoing_games)
        self.assertEqual(len(round_2_games), 2)
        scheduled_usernames = {
            player.username for game in round_2_games for player in (game.wplayer, game.bplayer)
        }
        bye_usernames = {
            player.username
            for player in reloaded_tournament.players
            if any(
                isinstance(game, ByeGame)
                and getattr(game, "round", None) == 2
                and getattr(game, "token", None) == "U"
                for game in reloaded_tournament.player_data_by_name(player.username).games
            )
        }
        scheduled_usernames.update(bye_usernames)
        self.assertEqual(len(scheduled_usernames), 5)
        self.assertNotIn(withdrawn.username, scheduled_usernames)

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss reload flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_survives_reload_between_rounds(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))

        current_tournament = self.tournament
        if current_tournament.clock_task is not None:
            current_tournament.clock_task.cancel()
            try:
                await current_tournament.clock_task
            except asyncio.CancelledError:
                pass

        for round_number in (1, 2, 3):
            current_tournament.current_round = round_number
            with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
                should_continue = await current_tournament.pair_fixed_round(
                    datetime.now(timezone.utc)
                )
            self.assertTrue(should_continue)

            round_games = list(current_tournament.ongoing_games)
            self.assertEqual(len(round_games), 2)
            scheduled_usernames = {
                player.username for game in round_games for player in (game.wplayer, game.bplayer)
            }
            self.assertEqual(
                scheduled_usernames,
                {player.username for player in current_tournament.players},
            )

            await self._finish_created_games(current_tournament, round_games)
            self.assertEqual(len(current_tournament.ongoing_games), 0)

            if round_number == 3:
                continue

            current_tournament.current_round = round_number + 1
            await current_tournament.save_current_round()

            _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
                app_state.db_client,
                tid,
            )
            self.assertIsNotNone(reloaded_tournament)
            assert reloaded_tournament is not None
            self.assertEqual(reloaded_tournament.current_round, round_number + 1)
            self.assertEqual(
                [len(player_data.games) for player_data in reloaded_tournament.players.values()],
                4 * [round_number],
            )

            waiting_usernames = {
                player.username for player in reloaded_tournament.waiting_players()
            }
            self.assertEqual(
                waiting_usernames,
                {player.username for player in reloaded_tournament.players},
            )
            if reloaded_tournament.clock_task is not None:
                reloaded_tournament.clock_task.cancel()
                try:
                    await reloaded_tournament.clock_task
                except asyncio.CancelledError:
                    pass
            current_tournament = reloaded_tournament

        self.assertEqual(
            [len(player_data.games) for player_data in current_tournament.players.values()],
            4 * [3],
        )
        self.assertEqual(
            [len(player_data.points) for player_data in current_tournament.players.values()],
            4 * [3],
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss reload flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_survives_reload_with_late_join(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))

        current_tournament = self.tournament
        if current_tournament.clock_task is not None:
            current_tournament.clock_task.cancel()
            try:
                await current_tournament.clock_task
            except asyncio.CancelledError:
                pass

        current_tournament.current_round = 1
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await current_tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)

        round_1_games = list(current_tournament.ongoing_games)
        self.assertEqual(len(round_1_games), 1)
        await self._finish_created_games(current_tournament, round_1_games)
        self.assertEqual(len(current_tournament.ongoing_games), 0)

        late = User(app_state, username="late_join_multi_reload", perfs=make_test_perfs())
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))
        join_error = await current_tournament.join(late)
        self.assertIsNone(join_error)

        late_data = current_tournament.player_data_by_name(late.username)
        self.assertIsNotNone(late_data)
        assert late_data is not None
        self.assertEqual(late_data.joined_round, 2)
        self.assertEqual([getattr(game, "token", "") for game in late_data.games], ["H"])

        for round_number in (2, 3):
            current_tournament.current_round = round_number
            await current_tournament.save_current_round()

            _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
                app_state.db_client,
                tid,
            )
            self.assertIsNotNone(reloaded_tournament)
            assert reloaded_tournament is not None
            self.assertEqual(reloaded_tournament.current_round, round_number)

            if reloaded_tournament.clock_task is not None:
                reloaded_tournament.clock_task.cancel()
                try:
                    await reloaded_tournament.clock_task
                except asyncio.CancelledError:
                    pass

            reloaded_late = reloaded_tournament.player_data_by_name(late.username)
            self.assertIsNotNone(reloaded_late)
            assert reloaded_late is not None
            self.assertEqual(reloaded_late.joined_round, 2)
            self.assertEqual(getattr(reloaded_late.games[0], "token", ""), "H")

            waiting_usernames = {
                player.username for player in reloaded_tournament.waiting_players()
            }
            self.assertEqual(
                waiting_usernames,
                {player.username for player in reloaded_tournament.players},
            )
            self.assertIn(late.username, waiting_usernames)

            with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
                should_continue = await reloaded_tournament.pair_fixed_round(
                    datetime.now(timezone.utc)
                )
            self.assertTrue(should_continue)

            round_games = list(reloaded_tournament.ongoing_games)
            self.assertEqual(len(round_games), 2)
            scheduled_usernames = {
                player.username for game in round_games for player in (game.wplayer, game.bplayer)
            }
            self.assertEqual(
                scheduled_usernames,
                {player.username for player in reloaded_tournament.players},
            )
            self.assertIn(late.username, scheduled_usernames)

            await self._finish_created_games(reloaded_tournament, round_games)
            self.assertEqual(len(reloaded_tournament.ongoing_games), 0)
            current_tournament = reloaded_tournament

        final_late = current_tournament.player_data_by_name(late.username)
        self.assertIsNotNone(final_late)
        assert final_late is not None
        self.assertEqual(len(final_late.games), 3)
        self.assertEqual(len(final_late.points), 3)
        self.assertEqual(getattr(final_late.games[0], "token", ""), "H")
        self.assertEqual(
            [len(player_data.games) for player_data in current_tournament.players.values()],
            4 * [3],
        )
        self.assertEqual(
            [len(player_data.points) for player_data in current_tournament.players.values()],
            4 * [3],
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss reload flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_survives_reload_with_pause_rejoin(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(4)
        await self.tournament.start(datetime.now(timezone.utc))

        current_tournament = self.tournament
        if current_tournament.clock_task is not None:
            current_tournament.clock_task.cancel()
            try:
                await current_tournament.clock_task
            except asyncio.CancelledError:
                pass

        current_tournament.current_round = 1
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await current_tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)

        round_1_games = list(current_tournament.ongoing_games)
        self.assertEqual(len(round_1_games), 2)
        await self._finish_created_games(current_tournament, round_1_games)
        self.assertEqual(len(current_tournament.ongoing_games), 0)

        paused_username = round_1_games[0].wplayer.username
        paused_user = current_tournament.get_player_by_name(paused_username)
        self.assertIsNotNone(paused_user)
        assert paused_user is not None

        await current_tournament.pause(paused_user)
        paused_data = current_tournament.player_data_by_name(paused_username)
        self.assertIsNotNone(paused_data)
        assert paused_data is not None
        self.assertTrue(paused_data.paused)

        current_tournament.current_round = 2
        await current_tournament.save_current_round()

        _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
            app_state.db_client,
            tid,
        )
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None
        self.assertEqual(reloaded_tournament.current_round, 2)

        if reloaded_tournament.clock_task is not None:
            reloaded_tournament.clock_task.cancel()
            try:
                await reloaded_tournament.clock_task
            except asyncio.CancelledError:
                pass

        reloaded_paused = reloaded_tournament.get_player_by_name(paused_username)
        self.assertIsNotNone(reloaded_paused)
        assert reloaded_paused is not None
        reloaded_paused_data = reloaded_tournament.player_data_by_name(paused_username)
        self.assertIsNotNone(reloaded_paused_data)
        assert reloaded_paused_data is not None
        self.assertTrue(reloaded_paused_data.paused)
        waiting_usernames = {player.username for player in reloaded_tournament.waiting_players()}
        self.assertNotIn(paused_username, waiting_usernames)

        rejoin_error = await reloaded_tournament.join(reloaded_paused)
        self.assertIsNone(rejoin_error)
        self.assertFalse(reloaded_paused_data.paused)

        for round_number in (2, 3):
            if round_number == 3:
                reloaded_tournament.current_round = round_number
                await reloaded_tournament.save_current_round()

                _reloaded_app_state, next_tournament = await self.reload_tournament(
                    app_state.db_client,
                    tid,
                )
                self.assertIsNotNone(next_tournament)
                assert next_tournament is not None
                self.assertEqual(next_tournament.current_round, 3)

                if next_tournament.clock_task is not None:
                    next_tournament.clock_task.cancel()
                    try:
                        await next_tournament.clock_task
                    except asyncio.CancelledError:
                        pass

                next_paused_data = next_tournament.player_data_by_name(paused_username)
                self.assertIsNotNone(next_paused_data)
                assert next_paused_data is not None
                self.assertFalse(next_paused_data.paused)
                reloaded_tournament = next_tournament

            waiting_usernames = {
                player.username for player in reloaded_tournament.waiting_players()
            }
            self.assertEqual(
                waiting_usernames,
                {player.username for player in reloaded_tournament.players},
            )
            self.assertIn(paused_username, waiting_usernames)

            with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
                should_continue = await reloaded_tournament.pair_fixed_round(
                    datetime.now(timezone.utc)
                )
            self.assertTrue(should_continue)

            round_games = list(reloaded_tournament.ongoing_games)
            self.assertEqual(len(round_games), 2)
            scheduled_usernames = {
                player.username for game in round_games for player in (game.wplayer, game.bplayer)
            }
            self.assertEqual(
                scheduled_usernames,
                {player.username for player in reloaded_tournament.players},
            )
            self.assertIn(paused_username, scheduled_usernames)

            await self._finish_created_games(reloaded_tournament, round_games)
            self.assertEqual(len(reloaded_tournament.ongoing_games), 0)

        final_paused = reloaded_tournament.player_data_by_name(paused_username)
        self.assertIsNotNone(final_paused)
        assert final_paused is not None
        self.assertFalse(final_paused.paused)
        self.assertEqual(
            [len(player_data.games) for player_data in reloaded_tournament.players.values()],
            4 * [3],
        )
        self.assertEqual(
            [len(player_data.points) for player_data in reloaded_tournament.players.values()],
            4 * [3],
        )

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss round flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_handles_late_join_and_rejoin(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)
        self.assertEqual(len(self.tournament.ongoing_games), 1)

        bye_players = [
            player.username
            for player in self.tournament.players
            if any(
                isinstance(game, ByeGame)
                for game in self.tournament.player_data_by_name(player.username).games
            )
        ]
        self.assertEqual(len(bye_players), 1)

        round_1_games = list(self.tournament.ongoing_games)
        self.assertEqual(len(round_1_games), 1)
        await self._finish_created_games(self.tournament, round_1_games)
        self.assertEqual(len(self.tournament.ongoing_games), 0)

        round_1_players = {round_1_games[0].wplayer.username, round_1_games[0].bplayer.username}
        rejoining_username = next(iter(round_1_players))
        rejoining_user = self.tournament.get_player_by_name(rejoining_username)
        self.assertIsNotNone(rejoining_user)
        assert rejoining_user is not None

        await self.tournament.pause(rejoining_user)
        rejoining_data = self.tournament.player_data_by_name(rejoining_username)
        self.assertIsNotNone(rejoining_data)
        assert rejoining_data is not None
        self.assertTrue(rejoining_data.paused)

        rejoin_error = await self.tournament.join(rejoining_user)
        self.assertIsNone(rejoin_error)
        self.assertFalse(rejoining_data.paused)

        late = User(app_state, username="late_join_round_flow", perfs=make_test_perfs())
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))
        late_error = await self.tournament.join(late)
        self.assertIsNone(late_error)

        late_data = self.tournament.player_data_by_name(late.username)
        self.assertIsNotNone(late_data)
        assert late_data is not None
        self.assertEqual(late_data.joined_round, 2)
        self.assertEqual(len(late_data.games), 1)
        self.assertIsInstance(late_data.games[0], ByeGame)
        self.assertEqual(getattr(late_data.games[0], "token", ""), "H")

        self.tournament.current_round = 2
        waiting_before_round_2 = {player.username for player in self.tournament.waiting_players()}
        self.assertIn(rejoining_username, waiting_before_round_2)
        self.assertIn(late.username, waiting_before_round_2)

        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)

        round_2_games = list(self.tournament.ongoing_games)
        self.assertEqual(len(round_2_games), 2)
        scheduled_usernames = {
            player.username for game in round_2_games for player in (game.wplayer, game.bplayer)
        }
        self.assertEqual(
            scheduled_usernames,
            {player.username for player in self.tournament.players},
        )
        self.assertIn(rejoining_username, scheduled_usernames)
        self.assertIn(late.username, scheduled_usernames)
        self.assertFalse(rejoining_data.paused)
        self.assertEqual(len(late_data.games), 2)

    @unittest.skipUnless(
        _has_swisspairing_runtime(),
        "swisspairing import unavailable for live Swiss reload flow test",
    )
    async def test_pair_fixed_round_with_real_swisspairing_backend_survives_reload_before_round_two(
        self,
    ):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))

        self.tournament.current_round = 1
        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)
        round_1_games = list(self.tournament.ongoing_games)
        self.assertEqual(len(round_1_games), 1)
        await self._finish_created_games(self.tournament, round_1_games)

        round_1_players = {round_1_games[0].wplayer.username, round_1_games[0].bplayer.username}
        rejoining_username = next(iter(round_1_players))
        rejoining_user = self.tournament.get_player_by_name(rejoining_username)
        self.assertIsNotNone(rejoining_user)
        assert rejoining_user is not None

        await self.tournament.pause(rejoining_user)
        rejoin_error = await self.tournament.join(rejoining_user)
        self.assertIsNone(rejoin_error)

        late = User(app_state, username="late_join_reload_flow", perfs=make_test_perfs())
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))
        late_error = await self.tournament.join(late)
        self.assertIsNone(late_error)

        self.tournament.current_round = 2
        await self.tournament.save_current_round()

        _reloaded_app_state, reloaded_tournament = await self.reload_tournament(
            app_state.db_client,
            tid,
        )
        self.assertIsNotNone(reloaded_tournament)
        assert reloaded_tournament is not None
        self.assertEqual(reloaded_tournament.current_round, 2)

        reloaded_rejoin = reloaded_tournament.player_data_by_name(rejoining_username)
        self.assertIsNotNone(reloaded_rejoin)
        assert reloaded_rejoin is not None
        self.assertFalse(reloaded_rejoin.paused)

        reloaded_late = reloaded_tournament.player_data_by_name(late.username)
        self.assertIsNotNone(reloaded_late)
        assert reloaded_late is not None
        self.assertEqual(reloaded_late.joined_round, 2)
        self.assertEqual(len(reloaded_late.games), 1)
        self.assertIsInstance(reloaded_late.games[0], ByeGame)
        self.assertEqual(getattr(reloaded_late.games[0], "token", ""), "H")

        waiting_before_round_2 = {
            player.username for player in reloaded_tournament.waiting_players()
        }
        self.assertEqual(
            waiting_before_round_2,
            {player.username for player in reloaded_tournament.players},
        )
        self.assertIn(rejoining_username, waiting_before_round_2)
        self.assertIn(late.username, waiting_before_round_2)

        with patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}):
            should_continue = await reloaded_tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertTrue(should_continue)

        round_2_games = list(reloaded_tournament.ongoing_games)
        self.assertEqual(len(round_2_games), 2)
        scheduled_usernames = {
            player.username for game in round_2_games for player in (game.wplayer, game.bplayer)
        }
        self.assertEqual(
            scheduled_usernames,
            {player.username for player in reloaded_tournament.players},
        )
        self.assertIn(rejoining_username, scheduled_usernames)
        self.assertIn(late.username, scheduled_usernames)
        self.assertEqual(len(reloaded_late.games), 2)

    async def test_create_pairing_records_engine_allocated_bye(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)

        waiting = list(self.tournament.waiting_players())
        users_by_id = {index: user for index, user in enumerate(waiting, start=1)}
        fake_state = SimpleNamespace(
            trf=object(),
            waiting_ids=set(users_by_id),
            users_by_id=users_by_id,
        )

        class _Engine:
            @staticmethod
            def generate_pairings(_trf):
                return [
                    SimpleNamespace(white=1, black=2),
                    SimpleNamespace(white=3, black=0),
                ]

        with (
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss.DutchEngine", _Engine),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1])])
        self.assertEqual(self.tournament.bye_players, [waiting[2]])

        bye_player_data = self.tournament.player_data_by_name(waiting[2].username)
        self.assertIsNotNone(bye_player_data)
        assert bye_player_data is not None
        self.assertEqual(bye_player_data.points[-1], "-")
        self.assertIsInstance(bye_player_data.games[-1], ByeGame)

        games = await self.tournament.games_json(waiting[2].username)
        self.assertEqual(games["games"][0]["unplayedType"], "bye")
        self.assertEqual(games["games"][0]["result"], "-")

        players_json = self.tournament.players_json()
        bye_row = next(row for row in players_json["players"] if row["name"] == waiting[2].username)
        self.assertEqual(bye_row["points"][-1], ("1", 1))

    async def test_create_pairing_respects_forbidden_pairs(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=1,
            rounds=3,
            with_clock=False,
            forbidden_pairings="test_forbidden_a test_forbidden_b",
        )
        app_state.tournaments[tid] = self.tournament

        for name in ("test_forbidden_a", "test_forbidden_b"):
            user = User(app_state, username=name, perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)

        waiting = list(self.tournament.waiting_players())
        with self.assertRaises(PairingUnavailable):
            self.tournament.create_pairing(waiting)

    async def test_manual_pairings_override_next_round_and_then_clear(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=0,
            rounds=3,
            with_clock=False,
            manual_pairings="manual_white manual_black\nmanual_bye 1",
        )
        app_state.tournaments[tid] = self.tournament

        for name in ("manual_white", "manual_black", "manual_bye"):
            user = User(app_state, username=name, perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)

        await upsert_tournament_to_db(self.tournament, app_state)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        self.assertTrue(await self.tournament.pair_fixed_round(datetime.now(timezone.utc)))
        self.assertEqual(len(self.tournament.ongoing_games), 1)

        game = next(iter(self.tournament.ongoing_games))
        self.assertEqual(game.wplayer.username, "manual_white")
        self.assertEqual(game.bplayer.username, "manual_black")

        bye_data = self.tournament.player_data_by_name("manual_bye")
        self.assertIsNotNone(bye_data)
        assert bye_data is not None
        self.assertEqual(bye_data.points[-1], "-")
        self.assertIsInstance(bye_data.games[-1], ByeGame)
        self.assertEqual(getattr(bye_data.games[-1], "token", ""), "U")

        self.assertEqual(self.tournament.manual_pairings, "")
        doc = await app_state.db.tournament.find_one({"_id": tid})
        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc.get("manualPairings"), "")

    async def test_create_pairing_raises_when_swisspairing_backend_is_unavailable(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}),
            patch("tournament.swiss._ensure_swisspairing_runtime_loaded"),
            patch("tournament.swiss.pair_snapshots_dutch", None),
        ):
            with self.assertRaisesRegex(RuntimeError, "requires swisspairing"):
                self.tournament.create_pairing(waiting)

    async def test_create_pairing_invalid_backend_env_falls_back_to_py4swiss(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        users_by_id = {index: user for index, user in enumerate(waiting, start=1)}
        fake_state = SimpleNamespace(
            trf=object(),
            waiting_ids=set(users_by_id),
            users_by_id=users_by_id,
        )

        class _Engine:
            @staticmethod
            def generate_pairings(_trf):
                return [
                    SimpleNamespace(white=1, black=2),
                    SimpleNamespace(white=3, black=4),
                ]

        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "bogus-backend"}),
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss.DutchEngine", _Engine),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1]), (waiting[2], waiting[3])])

    async def test_create_pairing_raises_pairing_unavailable_when_engine_cannot_pair(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(4)

        waiting = list(self.tournament.waiting_players())
        users_by_id = {index: user for index, user in enumerate(waiting, start=1)}
        fake_state = SimpleNamespace(
            trf=object(),
            waiting_ids=set(users_by_id),
            users_by_id=users_by_id,
        )

        class _Engine:
            @staticmethod
            def generate_pairings(_trf):
                raise swiss_mod.PairingError("No valid pairing exists")

        with (
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss.DutchEngine", _Engine),
        ):
            with self.assertRaisesRegex(PairingUnavailable, "No valid pairing exists"):
                self.tournament.create_pairing(waiting)

    async def test_pair_fixed_round_finishes_swiss_when_not_enough_active_players(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))
        self.assertFalse(should_continue)
        self.assertEqual(self.tournament.status, T_FINISHED)

    async def test_pair_fixed_round_finishes_swiss_when_pairing_unavailable(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 2

        async def _raise_pairing_unavailable(_waiting_players):
            raise PairingUnavailable("No valid pairing exists")

        with patch.object(
            self.tournament,
            "create_new_pairings",
            side_effect=_raise_pairing_unavailable,
        ):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))

        self.assertFalse(should_continue)
        self.assertEqual(self.tournament.status, T_FINISHED)

    async def test_persist_byes_awards_full_point_in_swiss(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=3, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(1)

        waiting = list(self.tournament.waiting_players())
        pairing = self.tournament.create_pairing(waiting)
        self.assertEqual(pairing, [])
        self.assertEqual(len(self.tournament.bye_players), 1)

        await self.tournament.persist_byes()

        player = waiting[0]
        self.assertEqual(
            self.tournament.leaderboard_score_by_username(player.username) // SCORE_SHIFT, 2
        )

    async def test_late_join_awards_half_point_and_missed_round_entries(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 2

        late = User(app_state, username="late_join_user")
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))

        result = await self.tournament.join(late)
        self.assertIsNone(result)

        pdata = self.tournament.player_data_by_name(late.username)
        self.assertIsNotNone(pdata)
        assert pdata is not None
        self.assertEqual(pdata.joined_round, 3)
        self.assertEqual(len(pdata.games), 2)
        self.assertTrue(all(isinstance(game, ByeGame) for game in pdata.games))
        self.assertEqual([getattr(game, "token", "") for game in pdata.games], ["H", "Z"])
        self.assertEqual(pdata.points, [(1, 0), (0, 0)])
        self.assertEqual(
            self.tournament.leaderboard_score_by_username(late.username) // SCORE_SHIFT,
            1,
        )

        games = await self.tournament.games_json(late.username)
        self.assertEqual([game["unplayedType"] for game in games["games"]], ["late", "absent"])
        self.assertEqual([game["result"] for game in games["games"]], ["-", "-"])

        players_json = self.tournament.players_json()
        late_row = next(row for row in players_json["players"] if row["name"] == late.username)
        self.assertEqual(late_row["points"][:2], [("½", 1), "-"])

    async def test_late_join_is_closed_after_half_rounds(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=4, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(3)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 3

        late = User(app_state, username="late_join_closed")
        app_state.users[late.username] = late
        late.tournament_sockets[tid] = set((None,))

        result = await self.tournament.join(late)
        self.assertEqual(result, "LATE_JOIN_CLOSED")

    async def test_swiss_join_requires_title_when_configured(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=1,
            rounds=5,
            with_clock=False,
            entry_titled_only=True,
        )
        app_state.tournaments[tid] = self.tournament

        untitled = User(app_state, username="untitled_swiss_player")
        untitled.tournament_sockets[tid] = set((None,))
        app_state.users[untitled.username] = untitled

        result = await self.tournament.join(untitled)
        self.assertEqual(result, "This tournament is limited to titled players.")

        titled = User(app_state, username="titled_swiss_player", title="IM")
        titled.tournament_sockets[tid] = set((None,))
        app_state.users[titled.username] = titled

        result = await self.tournament.join(titled)
        self.assertIsNone(result)

    async def test_swiss_join_enforces_rating_bounds(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=1,
            rounds=5,
            with_clock=False,
            entry_min_rating=1400,
            entry_max_rating=1800,
        )
        app_state.tournaments[tid] = self.tournament

        low = User(app_state, username="low_rated_swiss_player", perfs=make_test_perfs())
        low.perfs["chess"]["gl"]["r"] = 1300
        low.tournament_sockets[tid] = set((None,))
        app_state.users[low.username] = low
        self.assertEqual(
            await self.tournament.join(low),
            "Your rating is below the minimum allowed for this tournament.",
        )

        high = User(app_state, username="high_rated_swiss_player", perfs=make_test_perfs())
        high.perfs["chess"]["gl"]["r"] = 1900
        high.tournament_sockets[tid] = set((None,))
        app_state.users[high.username] = high
        self.assertEqual(
            await self.tournament.join(high),
            "Your rating is above the maximum allowed for this tournament.",
        )

        allowed = User(app_state, username="allowed_swiss_player", perfs=make_test_perfs())
        allowed.perfs["chess"]["gl"]["r"] = 1600
        allowed.tournament_sockets[tid] = set((None,))
        app_state.users[allowed.username] = allowed
        self.assertIsNone(await self.tournament.join(allowed))

    async def test_swiss_join_enforces_minimum_rated_games_for_new_players_only(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            variant="chess",
            before_start=1,
            rounds=5,
            with_clock=False,
            entry_min_rated_games=20,
        )
        app_state.tournaments[tid] = self.tournament

        newcomer = User(app_state, username="new_swiss_player", perfs=make_test_perfs())
        newcomer.perfs["chess"]["nb"] = 5
        newcomer.tournament_sockets[tid] = set((None,))
        app_state.users[newcomer.username] = newcomer
        self.assertEqual(
            await self.tournament.join(newcomer),
            "This tournament requires at least 20 rated Chess games.",
        )

        admitted = User(app_state, username="returning_swiss_player", perfs=make_test_perfs())
        admitted.perfs["chess"]["nb"] = 25
        admitted.tournament_sockets[tid] = set((None,))
        app_state.users[admitted.username] = admitted
        self.assertIsNone(await self.tournament.join(admitted))

        admitted.perfs["chess"]["nb"] = 0
        await self.tournament.pause(admitted)
        self.assertIsNone(await self.tournament.join(admitted))

    async def test_swiss_join_enforces_minimum_account_age(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state,
            tid,
            before_start=1,
            rounds=5,
            with_clock=False,
            entry_min_account_age_days=30,
        )
        app_state.tournaments[tid] = self.tournament

        recent = User(
            app_state,
            username="recent_swiss_player",
            created_at=datetime.now(timezone.utc) - timedelta(days=5),
        )
        recent.tournament_sockets[tid] = set((None,))
        app_state.users[recent.username] = recent
        self.assertEqual(
            await self.tournament.join(recent),
            "This tournament requires accounts to be at least 30 days old.",
        )

        established = User(
            app_state,
            username="established_swiss_player",
            created_at=datetime.now(timezone.utc) - timedelta(days=60),
        )
        established.tournament_sockets[tid] = set((None,))
        app_state.users[established.username] = established
        self.assertIsNone(await self.tournament.join(established))

    async def test_missing_swiss_game_blocks_future_swiss_entry(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, variant="chess", before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament

        for name in ("swiss_present_player", "swiss_absent_player"):
            user = User(app_state, username=name, perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await app_state.db.user.insert_one({"_id": user.username})
            await self.tournament.join(user)

        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]

        await game.play_move("e2e4")
        absent = game.bplayer
        await game.game_ended(absent, "flag")

        self.assertEqual(absent.swiss_ban_hours, 24)
        self.assertIsNotNone(absent.swiss_ban_until)
        assert absent.swiss_ban_until is not None

        del app_state.users[absent.username]
        reloaded_absent = await app_state.users.get(absent.username)

        next_tid = id8()
        next_tournament = SwissTestTournament(
            app_state, next_tid, variant="chess", before_start=1, rounds=2, with_clock=False
        )
        app_state.tournaments[next_tid] = next_tournament
        reloaded_absent.tournament_sockets[next_tid] = set((None,))

        join_error = await next_tournament.join(reloaded_absent)
        self.assertIsNotNone(join_error)
        assert join_error is not None
        self.assertIn("Because you missed your last Swiss game", join_error)
        self.assertIn("UTC", join_error)

    async def test_played_swiss_game_clears_existing_swiss_ban(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, variant="chess", before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament

        players: list[User] = []
        for name in ("swiss_returning_player", "swiss_opponent_player"):
            user = User(app_state, username=name, perfs=make_test_perfs())
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await app_state.db.user.insert_one({"_id": user.username})
            await self.tournament.join(user)
            players.append(user)

        banned = players[0]
        banned.swiss_ban_hours = 24
        banned.swiss_ban_until = datetime.now(timezone.utc) + timedelta(hours=24)
        await app_state.db.user.update_one(
            {"_id": banned.username},
            {
                "$set": {
                    "swissBanUntil": banned.swiss_ban_until,
                    "swissBanHours": banned.swiss_ban_hours,
                }
            },
        )

        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)
        game = games[0]

        await game.play_move("e2e4")
        await game.play_move("e7e5")
        await game.game_ended(game.wplayer, "resign")

        self.assertIsNone(banned.swiss_ban_until)
        self.assertEqual(banned.swiss_ban_hours, 0)

        doc = await app_state.db.user.find_one({"_id": banned.username})
        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertNotIn("swissBanUntil", doc)
        self.assertNotIn("swissBanHours", doc)

    async def test_pairing_bye_counts_in_swiss_leaderboard_tiebreak(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = swiss_mod.SwissTournament(
            app_state, tid, variant="chess", before_start=0, rounds=2, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        users = []
        for suffix in ("A", "B", "C"):
            user = User(
                app_state, username=f"{TEST_PREFIX}{suffix}", title="TEST", perfs=make_test_perfs()
            )
            app_state.users[user.username] = user
            user.tournament_sockets[tid] = set((None,))
            await self.tournament.join(user)
            users.append(user)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_players = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_players)

        paired_names = {games[0].wplayer.username, games[0].bplayer.username}
        bye_player = next(
            player for player in self.tournament.players if player.username not in paired_names
        )
        bye_data = self.tournament.player_data_by_name(bye_player.username)
        self.assertIsNotNone(bye_data)
        assert bye_data is not None
        self.assertEqual(bye_data.berger, 4)

        game = games[0]
        game.result = "1-0"
        game.status = FLAG
        game.board.ply = 20
        await self.tournament.game_update(game)

        self.assertEqual(self.tournament.leaderboard.peekitem(0)[0].username, bye_player.username)


class SwissScoringRulesTestCase(unittest.TestCase):
    def test_swiss_berger_virtualizes_pairing_bye(self):
        tournament = SimpleNamespace(variant="chess", current_round=1)
        player_data = SimpleNamespace(
            username="hero",
            points=["-"],
            games=[ByeGame(token="U", round_no=1)],
        )

        self.assertEqual(
            swiss_mod._swiss_berger_tiebreak(
                tournament,
                player_data,
                {"hero": 2},
            ),
            4,
        )

    def test_swiss_berger_ignores_late_and_absent_entries(self):
        tournament = SimpleNamespace(variant="chess", current_round=2)
        player_data = SimpleNamespace(
            username="hero",
            points=[(1, 0), (0, 0)],
            games=[ByeGame(token="H", round_no=1), ByeGame(token="Z", round_no=2)],
        )

        self.assertEqual(
            swiss_mod._swiss_berger_tiebreak(
                tournament,
                player_data,
                {"hero": 1},
            ),
            0,
        )

    def test_chess_pairing_allocated_bye_is_full_point(self):
        scoring = swiss_mod._build_scoring_system("chess")
        self.assertEqual(
            scoring.score_dict[
                (
                    swiss_mod.ResultToken.PAIRING_ALLOCATED_BYE,
                    swiss_mod.ColorToken.BYE_OR_NOT_PAIRED,
                )
            ],
            20,
        )

    def test_janggi_scores_use_base_ratios_and_variant_end_mapping(self):
        scoring = swiss_mod._build_scoring_system("janggi")
        self.assertEqual(
            scoring.score_dict[
                (
                    swiss_mod.ResultToken.PAIRING_ALLOCATED_BYE,
                    swiss_mod.ColorToken.BYE_OR_NOT_PAIRED,
                )
            ],
            70,
        )
        self.assertEqual(
            scoring.score_dict[
                (
                    swiss_mod.ResultToken.HALF_POINT_BYE,
                    swiss_mod.ColorToken.BYE_OR_NOT_PAIRED,
                )
            ],
            20,
        )
        self.assertEqual(
            scoring.score_dict[(swiss_mod.ResultToken.WIN_NOT_RATED, swiss_mod.ColorToken.WHITE)],
            40,
        )
        self.assertEqual(
            scoring.score_dict[(swiss_mod.ResultToken.LOSS_NOT_RATED, swiss_mod.ColorToken.BLACK)],
            20,
        )

    def test_build_player_results_uses_round_metadata_for_gapped_history(self):
        tournament = SimpleNamespace(variant="chess", id="t")
        player_data = SimpleNamespace(points=[], games=[])

        game_r1 = GameData(
            "g1",
            "hero",
            "1500",
            "opp1",
            "1500",
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            round_no=1,
        )
        game_r3 = GameData(
            "g3",
            "hero",
            "1500",
            "opp2",
            "1500",
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            round_no=3,
        )
        player_data.games = [game_r1, game_r3]
        player_data.points = [(2, 1), (2, 1)]

        ids_by_name = {"hero": 1, "opp1": 2, "opp2": 3}
        results = swiss_mod._build_player_results(
            tournament,
            "hero",
            player_data,
            ids_by_name,
            completed_rounds=3,
        )

        self.assertEqual([result.result.value for result in results], ["1", "Z", "1"])

    def test_build_swisspairing_float_history_counts_positive_byes_and_cross_score_games(self):
        tournament = SimpleNamespace(variant="chess", id="t")
        game_r1 = GameData(
            "g1",
            "p1",
            "1500",
            "p2",
            "1500",
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            round_no=1,
        )
        game_r2 = GameData(
            "g2",
            "p1",
            "1500",
            "p2",
            "1500",
            "1-0",
            datetime.now(timezone.utc),
            False,
            False,
            round_no=2,
        )
        player_one = SimpleNamespace(
            username="p1", points=[(2, 1), (2, 1)], games=[game_r1, game_r2]
        )
        player_two = SimpleNamespace(
            username="p2", points=[(0, 0), (0, 0)], games=[game_r1, game_r2]
        )
        player_three = SimpleNamespace(
            username="p3",
            points=[(2, 0), (0, 0)],
            games=[ByeGame(token="F", round_no=1), ByeGame(token="Z", round_no=2)],
        )
        float_kind = SimpleNamespace(NONE="none", UP="up", DOWN="down")

        with patch.object(swiss_mod, "SwissFloatKind", float_kind):
            history = swiss_mod._build_swisspairing_float_history(
                tournament,
                seed_entries=[
                    (2400, "p1", player_one),
                    (2300, "p2", player_two),
                    (2200, "p3", player_three),
                ],
                completed_rounds=2,
            )

        self.assertEqual(
            history,
            {
                "p1": ("none", "down"),
                "p2": ("none", "up"),
                "p3": ("down", "none"),
            },
        )

    def test_build_swisspairing_float_history_counts_half_bye_but_not_zero_point_absence(self):
        tournament = SimpleNamespace(variant="chess", id="t")
        player_data = SimpleNamespace(
            username="hero",
            points=[(1, 0), (0, 0)],
            games=[ByeGame(token="H", round_no=1), ByeGame(token="Z", round_no=2)],
        )
        float_kind = SimpleNamespace(NONE="none", UP="up", DOWN="down")

        with patch.object(swiss_mod, "SwissFloatKind", float_kind):
            history = swiss_mod._build_swisspairing_float_history(
                tournament,
                seed_entries=[(2400, "hero", player_data)],
                completed_rounds=2,
            )

        self.assertEqual(history, {"hero": ("down", "none")})

    def test_janggi_half_bye_uses_two_points(self):
        tournament = SimpleNamespace(
            variant="janggi",
            leaderboard_score_by_username=lambda _username: 2 * SCORE_SHIFT,
        )
        player_data = SimpleNamespace(
            points=[(2, 0)],
            games=[ByeGame(token="H", round_no=1)],
        )

        self.assertEqual(swiss_mod._half_bye_point_value("janggi"), 2)
        self.assertEqual(
            tournaments_mod._swiss_unplayed_point_from_token("H", "janggi"),
            (2, 0),
        )
        self.assertEqual(
            swiss_mod._score_points_times_ten(tournament, "hero", player_data, completed_rounds=1),
            20,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
