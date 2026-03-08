import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from const import T_FINISHED
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_arena import SwissTestTournament
from tournament import swiss as swiss_mod
from tournament.tournament import (
    AUTO_ROUND_INTERVAL,
    ByeGame,
    GameData,
    PairingUnavailable,
    SCORE_SHIFT,
)
from tournament_test_base import TournamentTestCase
from user import User


class SwissPairingTestCase(TournamentTestCase):
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
        users_by_id = {index: user for index, user in enumerate(waiting, start=1)}
        fake_state = SimpleNamespace(
            trf=object(),
            waiting_ids=set(users_by_id),
            users_by_id=users_by_id,
        )
        fake_result = SimpleNamespace(
            pairings=[
                SimpleNamespace(white_id="1", black_id="2"),
                SimpleNamespace(white_id="3", black_id="4"),
            ],
            unpaired_ids=(),
        )

        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}),
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss._build_swisspairing_player_states_from_trf", return_value=()),
            patch("tournament.swiss.swisspairing_pair_round_dutch", return_value=fake_result),
        ):
            pairing = self.tournament.create_pairing(waiting)

        self.assertEqual(pairing, [(waiting[0], waiting[1]), (waiting[2], waiting[3])])
        self.assertEqual(self.tournament.bye_players, [])

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

    async def test_create_pairing_raises_when_swisspairing_backend_is_unavailable(self):
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

        with (
            patch.dict("os.environ", {"SWISS_PAIRING_BACKEND": "swisspairing"}),
            patch("tournament.swiss._build_dutch_pairing_state", return_value=fake_state),
            patch("tournament.swiss.swisspairing_pair_round_dutch", None),
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


class SwissScoringRulesTestCase(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
