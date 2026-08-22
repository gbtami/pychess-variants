from datetime import UTC, datetime

from const import SWISS, T_ABORTED, T_CREATED, T_STARTED
from pychess_global_app_state_utils import get_app_state
from tournament.gdpr import TOURNAMENT_ERASED_USER_PREFIX, erase_user_from_tournaments
from tournament.rr import RRTournament
from tournament.rr.arrangements import (
    ARR_STATUS_CHALLENGED,
    ARR_STATUS_FINISHED,
    ARR_STATUS_PENDING,
    RRArrangement,
)
from tournament.swiss import SwissTournament
from tournament.tournament import SCORE_SHIFT, GameData, PlayerData
from tournament_test_base import TournamentTestCase
from user import User


class TournamentGdprTestCase(TournamentTestCase):
    @staticmethod
    def _register_player(tournament, user: User, score: int = 0) -> PlayerData:
        player_data = PlayerData(user.title, user.username, 1500, "")
        tournament.register_player(user, player_data)
        tournament.leaderboard.update({user: score * SCORE_SHIFT})
        tournament.nb_players += 1
        return player_data

    async def test_started_swiss_uses_one_ghost_for_loaded_player_and_pairings(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        tournament = SwissTournament(
            app_state,
            "swiss-gdpr",
            variant="chess",
            rounds=3,
            created_by="organizer",
            status=T_STARTED,
            with_clock=False,
        )
        app_state.tournaments[tournament.id] = tournament
        app_state.tourneysockets[tournament.id] = {}
        alice_data = self._register_player(tournament, alice, score=2)
        bob_data = self._register_player(tournament, bob, score=0)
        tournament.winner = alice.username

        game = GameData(
            "game-1",
            alice.username,
            "1500",
            bob.username,
            "1500",
            "1-0",
            datetime.now(UTC),
            False,
            False,
            round_no=1,
        )
        alice_data.games.append(game)
        bob_data.games.append(game)

        await app_state.db.tournament.insert_one(
            {
                "_id": tournament.id,
                "status": T_STARTED,
                "system": SWISS,
                "createdBy": "organizer",
                "winner": alice.username,
            }
        )
        await app_state.db.tournament_player.insert_one(
            {"_id": "player-a", "tid": tournament.id, "uid": alice.username}
        )
        await app_state.db.tournament_pairing.insert_one(
            {"_id": game.id, "tid": tournament.id, "u": [alice.username, bob.username]}
        )

        await erase_user_from_tournaments(app_state, alice.username)

        player_doc = await app_state.db.tournament_player.find_one({"_id": "player-a"})
        self.assertIsNotNone(player_doc)
        ghost = player_doc["uid"]
        self.assertTrue(ghost.startswith(TOURNAMENT_ERASED_USER_PREFIX))
        self.assertNotEqual(alice.username, ghost)

        pairing_doc = await app_state.db.tournament_pairing.find_one({"_id": game.id})
        self.assertEqual([ghost, bob.username], pairing_doc["u"])
        tournament_doc = await app_state.db.tournament.find_one({"_id": tournament.id})
        self.assertEqual(ghost, tournament_doc["winner"])

        self.assertIsNone(tournament.player_data_by_name(alice.username))
        ghost_data = tournament.player_data_by_name(ghost)
        self.assertIsNotNone(ghost_data)
        self.assertEqual(ghost, ghost_data.username)
        self.assertEqual("", ghost_data.title)
        self.assertEqual(ghost, game.wname)
        self.assertNotIn(alice.username, str(tournament.players_json()))

    async def test_started_rr_rekeys_historical_arrangement_and_linked_records(self):
        app_state = get_app_state(self.app)
        alice = User(app_state, username="alice")
        bob = User(app_state, username="bob")
        app_state.users[alice.username] = alice
        app_state.users[bob.username] = bob

        tournament = RRTournament(
            app_state,
            "rr-gdpr",
            variant="chess",
            created_by="organizer",
            status=T_STARTED,
            with_clock=False,
        )
        app_state.tournaments[tournament.id] = tournament
        app_state.tourneysockets[tournament.id] = {}
        self._register_player(tournament, alice)
        self._register_player(tournament, bob)

        old_arrangement_id = "rr-gdpr:alice:bob"
        arrangement = RRArrangement(
            old_arrangement_id,
            alice.username,
            bob.username,
            1,
            status=ARR_STATUS_FINISHED,
            game_id="rr-game",
            challenger=alice.username,
        )
        tournament.arrangements[arrangement.id] = arrangement
        bob.notifications = [
            {
                "_id": "loaded-notify",
                "notifies": bob.username,
                "type": "rrChallenge",
                "read": False,
                "createdAt": datetime.now(UTC),
                "expireAt": "",
                "content": {"tid": tournament.id, "arr": old_arrangement_id, "opp": "alice"},
            }
        ]

        await app_state.db.tournament.insert_one(
            {"_id": tournament.id, "status": T_STARTED, "createdBy": "organizer"}
        )
        await app_state.db.tournament_player.insert_one(
            {"_id": "rr-player-a", "tid": tournament.id, "uid": alice.username}
        )
        await app_state.db.tournament_arrangement.insert_one(arrangement.doc(tournament.id))
        await app_state.db.game.insert_one({"_id": "rr-game", "aid": old_arrangement_id})
        await app_state.db.notify.insert_one(
            {
                "_id": "rr-notify",
                "notifies": bob.username,
                "type": "rrChallenge",
                "read": False,
                "createdAt": datetime.now(UTC),
                "expireAt": "",
                "content": {"tid": tournament.id, "arr": old_arrangement_id, "opp": "alice"},
            }
        )

        await erase_user_from_tournaments(app_state, alice.username)

        player_doc = await app_state.db.tournament_player.find_one({"_id": "rr-player-a"})
        ghost = player_doc["uid"]
        self.assertNotIn(alice.username, arrangement.id)
        self.assertIsNone(
            await app_state.db.tournament_arrangement.find_one({"_id": old_arrangement_id})
        )
        arrangement_doc = await app_state.db.tournament_arrangement.find_one(
            {"_id": arrangement.id}
        )
        self.assertEqual([ghost, bob.username], arrangement_doc["u"])
        self.assertEqual([ghost, bob.username], arrangement_doc["c"])
        self.assertEqual(ghost, arrangement_doc["ch"])
        self.assertEqual(ghost, arrangement.white)
        self.assertEqual(ghost, arrangement.challenger)
        self.assertNotIn(alice.username, str(tournament.arrangement_payload()))

        game_doc = await app_state.db.game.find_one({"_id": "rr-game"})
        self.assertEqual(arrangement.id, game_doc["aid"])
        notification_doc = await app_state.db.notify.find_one({"_id": "rr-notify"})
        self.assertEqual(arrangement.id, notification_doc["content"]["arr"])
        self.assertEqual(ghost, notification_doc["content"]["opp"])
        self.assertEqual(arrangement.id, bob.notifications[0]["content"]["arr"])
        self.assertEqual(ghost, bob.notifications[0]["content"]["opp"])

    async def test_started_rr_clears_unplayable_pending_challenge(self):
        app_state = get_app_state(self.app)
        old_arrangement_id = "rr-challenge-gdpr:alice:bob"
        await app_state.db.tournament.insert_one(
            {"_id": "rr-challenge-gdpr", "status": T_STARTED, "createdBy": "organizer"}
        )
        await app_state.db.tournament_player.insert_one(
            {"_id": "rr-challenge-player", "tid": "rr-challenge-gdpr", "uid": "alice"}
        )
        await app_state.db.tournament_arrangement.insert_one(
            {
                "_id": old_arrangement_id,
                "tid": "rr-challenge-gdpr",
                "u": ["alice", "bob"],
                "c": ["alice", "bob"],
                "rn": 1,
                "s": ARR_STATUS_CHALLENGED,
                "d": datetime.now(UTC),
                "gid": "",
                "iid": "reserved-game",
                "ch": "bob",
            }
        )
        await app_state.db.seek.insert_one(
            {"_id": "rr-seek", "user": "bob", "rrArrangementId": old_arrangement_id}
        )

        await erase_user_from_tournaments(app_state, "alice")

        player_doc = await app_state.db.tournament_player.find_one({"_id": "rr-challenge-player"})
        ghost = player_doc["uid"]
        new_arrangement_id = f"rr-challenge-gdpr:{ghost}:bob"
        arrangement_doc = await app_state.db.tournament_arrangement.find_one(
            {"_id": new_arrangement_id}
        )
        self.assertEqual(ARR_STATUS_PENDING, arrangement_doc["s"])
        self.assertEqual("", arrangement_doc["iid"])
        self.assertEqual("", arrangement_doc["ch"])
        self.assertIsNone(await app_state.db.seek.find_one({"_id": "rr-seek"}))

    async def test_unstarted_registration_is_removed_and_owned_event_is_aborted(self):
        app_state = get_app_state(self.app)
        await app_state.db.tournament.insert_one(
            {
                "_id": "future-gdpr",
                "status": T_CREATED,
                "createdBy": "alice",
                "winner": "",
                "nbPlayers": 2,
                "rrPendingPlayers": ["alice"],
                "rrDeniedPlayers": [],
            }
        )
        await app_state.db.tournament_player.insert_many(
            [
                {"_id": "future-a", "tid": "future-gdpr", "uid": "alice", "wd": False},
                {"_id": "future-b", "tid": "future-gdpr", "uid": "bob", "wd": False},
            ]
        )

        await erase_user_from_tournaments(app_state, "alice")

        tournament_doc = await app_state.db.tournament.find_one({"_id": "future-gdpr"})
        self.assertEqual(T_ABORTED, tournament_doc["status"])
        self.assertTrue(tournament_doc["createdBy"].startswith(TOURNAMENT_ERASED_USER_PREFIX))
        self.assertEqual(1, tournament_doc["nbPlayers"])
        self.assertEqual([], tournament_doc.get("rrPendingPlayers", []))
        self.assertIsNone(await app_state.db.tournament_player.find_one({"_id": "future-a"}))
