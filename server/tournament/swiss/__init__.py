from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import cache
import importlib
import logging
import os
from pathlib import Path
import tempfile
from typing import TYPE_CHECKING, Any

from const import SWISS, T_STARTED
from tournament.tournament import PairingUnavailable, Tournament

from .bbp import (
    bbp_backend_unavailability_reason,
    build_bbp_trf_export_text,
    create_bbp_pairing,
)
from .history import (
    _build_player_results,
    _build_scoring_system,
    _bye_point_value,
    _half_bye_point_value,
    _normalized_pairing_lines,
    _score_points_times_ten,
    _swiss_berger_tiebreak,
)
from .runtime_support import (
    ColorToken,
    DutchEngine,
    PairingError,
    ParsedTrf,
    PlayerCode,
    PlayerSection,
    PY4SWISS_IMPORT_ERROR,
    ResultToken,
    RoundResult,
    ScoringPointSystem,
    ScoringPointSystemCode,
    XSection,
    XSectionConfiguration,
)
from .state import (
    _DutchPairingState,
    _build_dutch_pairing_state,
    _build_swisspairing_float_history,
    _build_swisspairing_snapshots,
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

_SWISS_PAIRING_BACKEND_ENV = "SWISS_PAIRING_BACKEND"

if TYPE_CHECKING:
    from game import Game
    from user import User


log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _SwissPairingRuntime:
    """Resolved swisspairing imports for the active process."""

    map_plan_to_users: Any | None
    pair_snapshots_dutch: Any | None
    pairing_error: Any
    float_kind: Any | None
    snapshot_cls: Any | None
    import_error: Exception | None


def _load_swisspairing_runtime() -> _SwissPairingRuntime:
    """Import swisspairing entry points without mutating module globals."""

    try:
        swisspairing_module = importlib.import_module("swisspairing")
        swisspairing_exceptions = importlib.import_module("swisspairing.exceptions")
        swisspairing_model = importlib.import_module("swisspairing.model")
        swisspairing_adapter = importlib.import_module("swisspairing.pychess_adapter")
        return _SwissPairingRuntime(
            map_plan_to_users=swisspairing_module.map_plan_to_users,
            pair_snapshots_dutch=swisspairing_module.pair_snapshots_dutch,
            pairing_error=swisspairing_exceptions.PairingError,
            float_kind=swisspairing_model.FloatKind,
            snapshot_cls=swisspairing_adapter.PychessPlayerSnapshot,
            import_error=None,
        )
    except Exception as exc:
        return _SwissPairingRuntime(
            map_plan_to_users=None,
            pair_snapshots_dutch=None,
            pairing_error=RuntimeError,
            float_kind=None,
            snapshot_cls=None,
            import_error=exc,
        )


@cache
def _swisspairing_runtime() -> _SwissPairingRuntime:
    """Cache swisspairing imports behind a small runtime descriptor."""

    return _load_swisspairing_runtime()


def _swiss_pairing_backend(tournament: Tournament | None = None) -> str:
    """Return the effective backend, preferring bbpPairings when available."""

    configured_backend = os.getenv(_SWISS_PAIRING_BACKEND_ENV, "").strip().lower()
    explicit_backend = configured_backend if configured_backend != "" else None
    if explicit_backend is not None and explicit_backend not in ("py4swiss", "swisspairing", "bbp"):
        log.warning(
            "Unknown %s=%s, falling back to default backend selection",
            _SWISS_PAIRING_BACKEND_ENV,
            configured_backend,
        )
        explicit_backend = None

    backend = explicit_backend or "bbp"
    if backend == "bbp" and tournament is not None:
        reason = bbp_backend_unavailability_reason(tournament)
        if reason is not None:
            if explicit_backend == "bbp":
                raise RuntimeError(reason)
            log.info(
                "%s; falling back to py4swiss backend for tournament %s",
                reason,
                tournament.id,
            )
            return "py4swiss"
    return backend


def build_trf_export_text(tournament: Tournament, waiting_players: list[User] | None = None) -> str:
    """Export current Swiss tournament pairing state as TRF text.

    The exported state mirrors the same internal mapping used by Swiss pairing.
    """
    if _swiss_pairing_backend(tournament) == "bbp":
        return build_bbp_trf_export_text(tournament, waiting_players)

    if ParsedTrf is None:
        raise RuntimeError(
            "Swiss TRF export requires py4swiss, but import failed"
        ) from PY4SWISS_IMPORT_ERROR

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
    """Swiss tournament implementation with py4swiss and swisspairing backends."""

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
    ) -> tuple[list[tuple[User, User]] | None, str | None, int]:
        manual_pairing, manual_used = self._consume_manual_pairings(waiting_players)
        if manual_used:
            return (manual_pairing, None, 0)

        if len(waiting_players) == 0:
            return ([], None, 0)
        if len(waiting_players) == 1:
            self._record_bye(waiting_players[0])
            return ([], None, 0)

        completed_rounds = max(0, self.current_round - 1)
        return (None, _swiss_pairing_backend(self), completed_rounds)

    def _create_pairing_with_backend(
        self,
        waiting_players: list[User],
        *,
        backend: str,
        completed_rounds: int,
    ) -> list[tuple[User, User]]:
        if backend == "bbp":
            raise RuntimeError("bbpPairings backend requires the async Swiss pairing flow")

        if backend == "py4swiss":
            if ParsedTrf is None:
                raise RuntimeError(
                    "Swiss pairing state mapping requires py4swiss, but import failed"
                ) from PY4SWISS_IMPORT_ERROR
            if DutchEngine is None:
                raise RuntimeError(
                    "Swiss (Dutch) pairing backend 'py4swiss' requires py4swiss, but import failed"
                ) from PY4SWISS_IMPORT_ERROR

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
                "Swiss Dutch pairing created %s games in %s using backend=%s",
                len(pairing),
                self.id,
                backend,
            )
            if len(waiting_players) >= 2 and len(pairing) == 0:
                raise PairingUnavailable("No valid pairing exists")
            return pairing

        swiss_runtime = _swisspairing_runtime()
        if swiss_runtime.pair_snapshots_dutch is None or swiss_runtime.map_plan_to_users is None:
            raise RuntimeError(
                "Swiss (Dutch) pairing backend 'swisspairing' requires swisspairing, but import failed"
            ) from swiss_runtime.import_error

        pair_snapshots_dutch = swiss_runtime.pair_snapshots_dutch
        map_plan_to_users = swiss_runtime.map_plan_to_users

        snapshots = _build_swisspairing_snapshots(self, waiting_players, completed_rounds)

        try:
            swisspairing_plan = pair_snapshots_dutch(snapshots)
        except swiss_runtime.pairing_error as exc:
            raise PairingUnavailable(
                f"swisspairing could not find a legal Dutch pairing: {exc}"
            ) from exc

        try:
            pairings, byes = map_plan_to_users(swisspairing_plan, tuple(waiting_players))
        except ValueError as exc:
            raise RuntimeError(
                "swisspairing returned an invalid username-based pairing plan for %s: %s"
                % (self.id, exc)
            ) from exc

        for bye_player in byes:
            self._record_bye(bye_player)

        pairing = list(pairings)
        accounted_names = {player.username for pair in pairing for player in pair}.union(
            player.username for player in byes
        )
        unresolved_names = sorted(
            player.username for player in waiting_players if player.username not in accounted_names
        )
        if unresolved_names:
            raise RuntimeError(
                "swisspairing left waiting players unpaired in %s: %s" % (self.id, unresolved_names)
            )
        log.debug(
            "Swiss Dutch pairing created %s games in %s using backend=%s",
            len(pairing),
            self.id,
            backend,
        )
        if len(waiting_players) >= 2 and len(pairing) == 0:
            raise PairingUnavailable("No valid pairing exists")
        return pairing

    async def create_pairing_async(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        precomputed, backend, completed_rounds = self._prepare_pairing_request(waiting_players)
        if precomputed is not None:
            return precomputed

        assert backend is not None
        if backend == "bbp":
            pairing = await create_bbp_pairing(self, waiting_players, completed_rounds)
            log.debug(
                "Swiss Dutch pairing created %s games in %s using backend=%s",
                len(pairing),
                self.id,
                backend,
            )
            if len(waiting_players) >= 2 and len(pairing) == 0:
                raise PairingUnavailable("No valid pairing exists")
            return pairing

        return self._create_pairing_with_backend(
            waiting_players,
            backend=backend,
            completed_rounds=completed_rounds,
        )

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        """Create pairings for the current waiting players using the active backend."""

        precomputed, backend, completed_rounds = self._prepare_pairing_request(waiting_players)
        if precomputed is not None:
            return precomputed

        assert backend is not None
        if backend == "bbp":
            configured_backend = os.getenv(_SWISS_PAIRING_BACKEND_ENV, "").strip().lower()
            if configured_backend == "bbp":
                raise RuntimeError("bbpPairings backend requires the async Swiss pairing flow")
            log.info(
                "Sync Swiss pairing call is falling back to py4swiss for tournament %s "
                "because bbpPairings requires async subprocess execution",
                self.id,
            )
            backend = "py4swiss"

        return self._create_pairing_with_backend(
            waiting_players,
            backend=backend,
            completed_rounds=completed_rounds,
        )


__all__ = [
    "ColorToken",
    "DutchEngine",
    "ParsedTrf",
    "PairingError",
    "PlayerCode",
    "PlayerSection",
    "PY4SWISS_IMPORT_ERROR",
    "ResultToken",
    "RoundResult",
    "ScoringPointSystem",
    "ScoringPointSystemCode",
    "SwissTournament",
    "XSection",
    "XSectionConfiguration",
    "_DutchPairingState",
    "_SwissPairingRuntime",
    "_build_dutch_pairing_state",
    "_build_player_results",
    "_build_scoring_system",
    "_build_swisspairing_float_history",
    "_build_swisspairing_snapshots",
    "_bye_point_value",
    "_half_bye_point_value",
    "_load_swisspairing_runtime",
    "_materialize_pairings",
    "_normalized_pairing_lines",
    "_score_points_times_ten",
    "_swisspairing_runtime",
    "_swiss_berger_tiebreak",
    "_swiss_pairing_backend",
    "build_trf_export_text",
]
