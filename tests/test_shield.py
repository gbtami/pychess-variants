from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from const import SHIELD, T_FINISHED
from generate_shield import generate_shield
from newid import id8
from pychess_global_app_state_utils import get_app_state
from tournament.auto_play_tournament import ArenaTestTournament
from tournament.tournament import upsert_tournament_to_db
from tournament_test_base import TournamentTestCase
from user import User
from variants import get_server_variant


class ShieldTestCase(TournamentTestCase):
    async def test_zero_game_shield_does_not_replace_live_owner(self):
        app_state = get_app_state(self.app)
        variant = "chess"
        previous_owner = "previous-shield-owner"
        previous_start = datetime.now(UTC) - timedelta(days=30)
        app_state.shield[variant] = [(previous_owner, previous_start, "previous-shield")]
        app_state.shield_owners[variant] = previous_owner

        self.tournament = ArenaTestTournament(
            app_state,
            id8(),
            variant=variant,
            before_start=0,
            minutes=1,
            with_clock=False,
        )
        self.tournament.frequency = SHIELD
        self.tournament.status = T_FINISHED
        app_state.tournaments[self.tournament.id] = self.tournament
        await upsert_tournament_to_db(self.tournament, app_state)

        challenger = User(app_state, username="zero-game-shield-player")
        app_state.users[challenger.username] = challenger
        await self.tournament.join(challenger)

        with patch(
            "tournament.tournament.refresh_lobby_tournament_winners_cache",
            new=AsyncMock(),
        ):
            await self.tournament.save()

        self.assertEqual(app_state.shield_owners[variant], previous_owner)
        self.assertEqual(
            app_state.shield[variant],
            [(previous_owner, previous_start, "previous-shield")],
        )

    async def test_generate_shield_ignores_newer_zero_game_tournament(self):
        app_state = get_app_state(self.app)
        variant = "makruk"
        variant_code = get_server_variant(variant, False).code
        now = datetime.now(UTC)

        await app_state.db.tournament.insert_many(
            [
                {
                    "_id": "played-shield",
                    "v": variant_code,
                    "z": 0,
                    "fr": SHIELD,
                    "status": T_FINISHED,
                    "startsAt": now - timedelta(days=30),
                    "winner": "played-winner",
                    "nbGames": 1,
                },
                {
                    "_id": "zero-game-shield",
                    "v": variant_code,
                    "z": 0,
                    "fr": SHIELD,
                    "status": T_FINISHED,
                    "startsAt": now,
                    "winner": "zero-game-winner",
                    "nbGames": 0,
                },
            ]
        )

        with patch("generate_shield.VARIANTS", (variant,)):
            await generate_shield(app_state)

        self.assertEqual(app_state.shield_owners[variant], "played-winner")
        self.assertEqual(len(app_state.shield[variant]), 1)
        owner, _starts_at, tournament_id = app_state.shield[variant][0]
        self.assertEqual(owner, "played-winner")
        self.assertEqual(tournament_id, "played-shield")
