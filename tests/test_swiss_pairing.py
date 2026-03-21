import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from const import FLAG, TEST_PREFIX, T_FINISHED
from glicko2.glicko2 import new_default_perf_map
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_tournament import SwissTestTournament
from tournament import swiss as swiss_mod
from tournament import tournaments as tournaments_mod
from tournament.tournament import (
    AUTO_ROUND_INTERVAL,
    ByeGame,
    GameData,
    PairingUnavailable,
    SCORE_SHIFT,
    SWISS_FINISH_REASON_NO_LEGAL_PAIRING,
    SWISS_FINISH_REASON_NOT_ENOUGH_PLAYERS,
    upsert_tournament_to_db,
)
from tournament_test_base import TournamentTestCase
from user import User
from variants import VARIANTS


def make_test_perfs():
    return new_default_perf_map(VARIANTS)


class SwissPairingTestCase(TournamentTestCase):
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
        self.assertEqual(self.tournament.finish_reason, SWISS_FINISH_REASON_NOT_ENOUGH_PLAYERS)
        self.assertEqual(
            [(line["user"], line["message"]) for line in list(self.tournament.tourneychat)[-2:]],
            [
                ("_server", "Not enough players left."),
                ("_server", "Tournament completed!"),
            ],
        )

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

        async def _raise_pairing_unavailable(_waiting_players, **_kwargs):
            raise PairingUnavailable("No valid pairing exists")

        with patch.object(
            self.tournament,
            "create_new_pairings",
            side_effect=_raise_pairing_unavailable,
        ):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))

        self.assertFalse(should_continue)
        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(self.tournament.finish_reason, SWISS_FINISH_REASON_NO_LEGAL_PAIRING)
        self.assertEqual(
            [(line["user"], line["message"]) for line in list(self.tournament.tourneychat)[-2:]],
            [
                ("_server", "All possible pairings were played."),
                ("_server", "Tournament completed!"),
            ],
        )

    async def test_early_finished_swiss_normalizes_rounds_and_announces_reason_in_chat(self):
        app_state = get_app_state(self.app)
        tid = id8()
        self.tournament = SwissTestTournament(
            app_state, tid, before_start=1, rounds=5, with_clock=False
        )
        app_state.tournaments[tid] = self.tournament
        await self.tournament.join_players(2)
        await self.tournament.start(datetime.now(timezone.utc))
        self.tournament.current_round = 1

        waiting_round_1 = list(self.tournament.waiting_players())
        _, games = await self.tournament.create_new_pairings(waiting_round_1)
        await self._finish_created_games(self.tournament, games)

        self.tournament.current_round = 2

        async def _raise_pairing_unavailable(_waiting_players, **_kwargs):
            raise PairingUnavailable("No valid pairing exists")

        with patch.object(
            self.tournament,
            "create_new_pairings",
            side_effect=_raise_pairing_unavailable,
        ):
            should_continue = await self.tournament.pair_fixed_round(datetime.now(timezone.utc))

        self.assertFalse(should_continue)
        self.assertEqual(self.tournament.status, T_FINISHED)
        self.assertEqual(self.tournament.finish_reason, SWISS_FINISH_REASON_NO_LEGAL_PAIRING)
        self.assertEqual(self.tournament.current_round, 1)
        self.assertEqual(self.tournament.rounds, 1)
        self.assertEqual(self.tournament.summary.get("rounds"), 1)
        self.assertEqual(self.tournament.live_status(datetime.now(timezone.utc)).get("rounds"), 1)
        self.assertEqual(
            [(line["user"], line["message"]) for line in list(self.tournament.tourneychat)[-2:]],
            [
                ("_server", "All possible pairings were played."),
                ("_server", "Tournament completed!"),
            ],
        )

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
