from __future__ import annotations

from datetime import datetime, timezone
import logging
from pathlib import Path
import tempfile
from typing import TYPE_CHECKING

from const import SWISS, T_STARTED
from py4swiss.engines import DutchEngine
from py4swiss.engines.common import PairingError
from py4swiss.trf import ParsedTrf
from py4swiss.trf.codes import PlayerCode
from py4swiss.trf.results import (
    ColorToken,
    ResultToken,
    RoundResult,
    ScoringPointSystem,
    ScoringPointSystemCode,
)
from py4swiss.trf.sections import PlayerSection, XSection
from py4swiss.trf.sections.x_section import XSectionConfiguration
from tournament.tournament import PairingUnavailable, Tournament

from .history import (
    _build_player_results,
    _build_scoring_system,
    _bye_point_value,
    _half_bye_point_value,
    _normalized_pairing_lines,
    _score_points_times_ten,
    _swiss_berger_tiebreak,
)
from .state import (
    _DutchPairingState,
    _build_dutch_pairing_state,
    _materialize_pairings,
)
from .tournament_ops import (
    _active_swiss_ban_until as _active_swiss_ban_until_impl,
    _apply_bye_points as _apply_bye_points_impl,
    _ban_swiss_no_show as _ban_swiss_no_show_impl,
    _clear_consumed_manual_pairings as _clear_consumed_manual_pairings_impl,
    _clear_swiss_ban as _clear_swiss_ban_impl,
    _consume_manual_pairings as _consume_manual_pairings_impl,
    _initialize_late_entry_round_history as _initialize_late_entry_round_history_impl,
    _is_late_join_allowed as _is_late_join_allowed_impl,
    _late_join_half_point as _late_join_half_point_impl,
    _manual_pairing_entries as _manual_pairing_entries_impl,
    _player_who_did_not_move as _player_who_did_not_move_impl,
    _record_bye as _record_bye_impl,
    _update_swiss_no_show_bans as _update_swiss_no_show_bans_impl,
    pair_fixed_round as pair_fixed_round_impl,
    persist_byes as persist_byes_impl,
    persist_unpaired_round_entries as persist_unpaired_round_entries_impl,
    recalculate_berger_tiebreak as recalculate_berger_tiebreak_impl,
)

if TYPE_CHECKING:
    from game import Game
    from user import User


log = logging.getLogger(__name__)


def build_trf_export_text(tournament: Tournament, waiting_players: list[User] | None = None) -> str:
    """Export current Swiss tournament pairing state as TRF text.

    The exported state mirrors the same internal mapping used by Swiss pairing.
    """
    selected_waiting_players = waiting_players
    if selected_waiting_players is None:
        selected_waiting_players = tournament.waiting_players()

    completed_rounds = max(0, tournament.current_round - 1)
    state = _build_dutch_pairing_state(
        tournament=tournament,
        waiting_players=selected_waiting_players,
        completed_rounds=completed_rounds,
    )

    # py4swiss currently exposes TRF serialization through file output.
    with tempfile.NamedTemporaryFile(suffix=".trf", delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        state.trf.write_to_file(temp_path)
        return temp_path.read_text(encoding="utf-8")
    finally:
        temp_path.unlink(missing_ok=True)


class SwissTournament(Tournament):
    """Swiss tournament implementation backed by py4swiss."""

    system = SWISS

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._manual_pairings_used_for_round = False
        self._last_manual_bye_count = 0

    async def _clear_consumed_manual_pairings(self) -> None:
        await _clear_consumed_manual_pairings_impl(self)

    def _manual_pairing_entries(
        self,
        waiting_players: list[User],
    ) -> tuple[list[tuple[User, User]], list[User]]:
        return _manual_pairing_entries_impl(self, waiting_players)

    def _consume_manual_pairings(
        self,
        waiting_players: list[User],
    ) -> tuple[list[tuple[User, User]], bool]:
        return _consume_manual_pairings_impl(self, waiting_players)

    def _active_swiss_ban_until(self, user: User, now: datetime | None = None) -> datetime | None:
        return _active_swiss_ban_until_impl(self, user, now)

    async def _clear_swiss_ban(self, user: User) -> None:
        await _clear_swiss_ban_impl(self, user)

    async def _ban_swiss_no_show(self, user: User, now: datetime) -> None:
        await _ban_swiss_no_show_impl(self, user, now)

    def _player_who_did_not_move(self, game: Game) -> User | None:
        return _player_who_did_not_move_impl(self, game)

    async def _update_swiss_no_show_bans(self, game: Game) -> None:
        await _update_swiss_no_show_bans_impl(self, game)

    def recalculate_berger_tiebreak(self) -> None:
        recalculate_berger_tiebreak_impl(self)

    def _record_bye(self, player: User) -> None:
        _record_bye_impl(self, player)

    def _is_late_join_allowed(self) -> bool:
        return _is_late_join_allowed_impl(self)

    def _late_join_half_point(self) -> int:
        return _late_join_half_point_impl(self)

    def entry_condition_error(self, user: User) -> str | None:
        base_error = super().entry_condition_error(user)
        if base_error is not None:
            return base_error

        banned_until = self._active_swiss_ban_until(user)
        if banned_until is None:
            return None

        return (
            "Because you missed your last Swiss game, you cannot enter a new Swiss tournament "
            "until %s."
        ) % banned_until.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    async def _initialize_late_entry_round_history(self, player: User) -> None:
        await _initialize_late_entry_round_history_impl(self, player)

    async def join(self, user: User, password: str | None = None) -> str | None:
        is_new_player = self.player_data_by_name(user.username) is None
        if self.status == T_STARTED and is_new_player and not self._is_late_join_allowed():
            return "LATE_JOIN_CLOSED"

        result = await super().join(user, password)
        if result is not None:
            return result

        if self.status == T_STARTED and is_new_player:
            player = self.get_player_by_name(user.username) or user
            await self._initialize_late_entry_round_history(player)
            await self.db_update_player(player, "GAME_END")

        return None

    async def game_update(self, game: Game) -> None:
        await super().game_update(game)
        await self._update_swiss_no_show_bans(game)

    async def pair_fixed_round(self, now: datetime) -> bool:
        return await pair_fixed_round_impl(self, now)

    def _apply_bye_points(self, player: User) -> None:
        _apply_bye_points_impl(self, player)

    async def persist_byes(self) -> None:
        await persist_byes_impl(self)

    async def persist_unpaired_round_entries(
        self,
        round_no: int,
        pairing: list[tuple[User, User]],
        bye_players: list[User],
    ) -> None:
        await persist_unpaired_round_entries_impl(self, round_no, pairing, bye_players)

    def _prepare_pairing_request(
        self,
        waiting_players: list[User],
    ) -> tuple[list[tuple[User, User]] | None, int]:
        manual_pairing, manual_used = self._consume_manual_pairings(waiting_players)
        if manual_used:
            return (manual_pairing, 0)

        if len(waiting_players) == 0:
            return ([], 0)
        if len(waiting_players) == 1:
            self._record_bye(waiting_players[0])
            return ([], 0)

        completed_rounds = max(0, self.current_round - 1)
        return (None, completed_rounds)

    def _create_pairing(
        self,
        waiting_players: list[User],
        *,
        completed_rounds: int,
    ) -> list[tuple[User, User]]:
        state = _build_dutch_pairing_state(self, waiting_players, completed_rounds)
        try:
            dutch_pairings = DutchEngine.generate_pairings(state.trf)
        except PairingError as exc:
            raise PairingUnavailable(
                f"py4swiss could not find a legal Dutch pairing: {exc}"
            ) from exc

        pairings_by_id = [
            (dutch_pairing.white, dutch_pairing.black if dutch_pairing.black != 0 else None)
            for dutch_pairing in dutch_pairings
        ]
        pairing = _materialize_pairings(
            tournament=self,
            state=state,
            backend_name="py4swiss",
            pairings_by_id=pairings_by_id,
        )
        log.debug(
            "Swiss Dutch pairing created %s games in %s using backend=py4swiss",
            len(pairing),
            self.id,
        )
        if len(waiting_players) >= 2 and len(pairing) == 0:
            raise PairingUnavailable("No valid pairing exists")
        return pairing

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        """Create pairings for the current waiting players using py4swiss."""

        precomputed, completed_rounds = self._prepare_pairing_request(waiting_players)
        if precomputed is not None:
            return precomputed

        return self._create_pairing(
            waiting_players,
            completed_rounds=completed_rounds,
        )


__all__ = [
    "ColorToken",
    "DutchEngine",
    "ParsedTrf",
    "PairingError",
    "PlayerCode",
    "PlayerSection",
    "ResultToken",
    "RoundResult",
    "ScoringPointSystem",
    "ScoringPointSystemCode",
    "SwissTournament",
    "XSection",
    "XSectionConfiguration",
    "_DutchPairingState",
    "_build_dutch_pairing_state",
    "_build_player_results",
    "_build_scoring_system",
    "_bye_point_value",
    "_half_bye_point_value",
    "_materialize_pairings",
    "_normalized_pairing_lines",
    "_score_points_times_ten",
    "_swiss_berger_tiebreak",
    "build_trf_export_text",
]
