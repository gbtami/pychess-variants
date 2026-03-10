from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from tournament.tournament import ByeGame, Tournament

from . import runtime_support as runtime
from .history import (
    _build_forbidden_opponents_by_name,
    _build_player_results,
    _build_rank_map,
    _build_scoring_system,
    _forbidden_pair_ids,
    _round_entries_by_number,
    _score_points_times_ten,
    _seed_rating,
)

if TYPE_CHECKING:
    from tournament.tournament import PlayerData
    from user import User


def _swiss_module():
    """Return the loaded ``tournament.swiss`` facade module."""

    from tournament import swiss as swiss_module

    return swiss_module


@dataclass(slots=True)
class _DutchPairingState:
    """TRF state plus waiting-player lookup used by the py4swiss backend."""

    trf: Any
    waiting_ids: set[int]
    users_by_id: dict[int, User]


def _build_swisspairing_float_history(
    tournament: Tournament,
    *,
    seed_entries: list[tuple[int, str, PlayerData]],
    completed_rounds: int,
) -> dict[str, tuple[Any, ...]]:
    """Derive per-player float history from the recorded completed rounds."""

    swiss_module = _swiss_module()
    swiss_runtime = swiss_module._swisspairing_runtime()
    if swiss_runtime.float_kind is None:
        raise RuntimeError(
            "Swiss pairing backend 'swisspairing' requires swisspairing float types, but import failed"
        ) from swiss_runtime.import_error

    float_kind = swiss_runtime.float_kind

    rank_by_name = {username: index for index, (_, username, _) in enumerate(seed_entries, start=1)}
    ids_by_name = {username: rank_by_name[username] for _, username, _ in seed_entries}
    names_by_id = {player_id: username for username, player_id in ids_by_name.items()}
    scoring_system = _build_scoring_system(tournament.variant)
    round_results_by_name = {
        username: _build_player_results(
            tournament,
            username,
            player_data,
            ids_by_name,
            completed_rounds,
        )
        for _, username, player_data in seed_entries
    }
    points_by_name = {username: 0 for _, username, _ in seed_entries}
    history_by_name: dict[str, list[Any]] = {username: [] for username in round_results_by_name}

    for round_index in range(completed_rounds):
        round_assignments = {username: float_kind.NONE for _, username, _ in seed_entries}

        for _, username, _ in seed_entries:
            round_result = round_results_by_name[username][round_index]
            opponent_id = getattr(round_result, "id", 0)
            color_value = getattr(getattr(round_result, "color", None), "value", None)

            if color_value == runtime.ColorToken.WHITE.value and opponent_id != 0:
                opponent_name = names_by_id.get(opponent_id)
                if opponent_name is None:
                    continue

                opponent_result = round_results_by_name[opponent_name][round_index]
                if round_result.result.is_played() and opponent_result.result.is_played():
                    white_score = points_by_name[username]
                    black_score = points_by_name[opponent_name]
                    if white_score != black_score:
                        higher_name, lower_name = (
                            (username, opponent_name)
                            if (-white_score, rank_by_name[username])
                            <= (-black_score, rank_by_name[opponent_name])
                            else (opponent_name, username)
                        )
                        round_assignments[higher_name] = float_kind.DOWN
                        round_assignments[lower_name] = float_kind.UP
                else:
                    for assignee_name, assignee_result in (
                        (username, round_result),
                        (opponent_name, opponent_result),
                    ):
                        if (
                            not assignee_result.result.is_played()
                            and scoring_system.get_points_times_ten(assignee_result) > 0
                        ):
                            round_assignments[assignee_name] = float_kind.DOWN
                continue

            if opponent_id == 0 and scoring_system.get_points_times_ten(round_result) > 0:
                round_assignments[username] = float_kind.DOWN

        for _, username, _ in seed_entries:
            history_by_name[username].append(round_assignments[username])
            points_by_name[username] += (
                scoring_system.get_points_times_ten(round_results_by_name[username][round_index])
                // 10
            )

    return {username: tuple(history) for username, history in history_by_name.items()}


def _build_swisspairing_snapshots(
    tournament: Tournament,
    waiting_players: list[User],
    completed_rounds: int,
) -> tuple[Any, ...]:
    """Build swisspairing snapshots for the waiting players in the current round."""

    swiss_module = _swiss_module()
    swiss_runtime = swiss_module._swisspairing_runtime()
    if swiss_runtime.snapshot_cls is None:
        raise RuntimeError(
            "Swiss pairing backend 'swisspairing' requires swisspairing snapshot helpers, but import failed"
        ) from swiss_runtime.import_error

    snapshot_cls = swiss_runtime.snapshot_cls

    all_names = sorted(
        {player.username for player in tournament.players}.union(tournament.players_by_name)
    )
    waiting_names = {user.username for user in waiting_players}

    seed_entries: list[tuple[int, str, PlayerData]] = []
    for username in all_names:
        player_data = tournament.player_data_by_name(username)
        if player_data is None:
            continue
        seed_entries.append((_seed_rating(player_data), username, player_data))

    seed_entries.sort(key=lambda item: (-item[0], item[1]))
    pairing_no_by_name = {
        username: index for index, (_, username, _) in enumerate(seed_entries, start=1)
    }
    forbidden_by_name = _build_forbidden_opponents_by_name(
        tournament.forbidden_pairings,
        waiting_names,
    )
    float_history_by_name = _build_swisspairing_float_history(
        tournament,
        seed_entries=seed_entries,
        completed_rounds=completed_rounds,
    )

    scores_by_name = {
        username: _score_points_times_ten(tournament, username, player_data, completed_rounds)
        for _, username, player_data in seed_entries
        if username in waiting_names
    }
    top_score = max(scores_by_name.values(), default=0)

    snapshots: list[Any] = []
    for _, username, player_data in seed_entries:
        if username not in waiting_names:
            continue

        round_entries = _round_entries_by_number(tournament, username, player_data)
        opponents: list[str] = []
        color_history: list[str] = []
        unplayed_games = 0
        had_full_point_bye = False
        had_full_point_unplayed_round = False

        for round_no in range(1, completed_rounds + 1):
            round_entry = round_entries.get(round_no)
            if round_entry is None:
                unplayed_games += 1
                continue

            game, point_entry = round_entry
            if isinstance(game, ByeGame):
                unplayed_games += 1
                token = getattr(game, "token", "U")
                if token == "U":
                    had_full_point_bye = True
                elif token == "F":
                    had_full_point_unplayed_round = True
                continue

            if point_entry == "-":
                unplayed_games += 1

            white_name = game.wplayer.username
            black_name = game.bplayer.username
            if username == white_name:
                opponents.append(black_name)
                color_history.append("white")
            elif username == black_name:
                opponents.append(white_name)
                color_history.append("black")

        snapshots.append(
            snapshot_cls(
                username=username,
                pairing_no=pairing_no_by_name[username],
                score=scores_by_name[username],
                opponents=frozenset(opponents),
                forbidden_opponents=forbidden_by_name.get(username, frozenset()),
                color_history=tuple(color_history),
                unplayed_games=unplayed_games,
                had_full_point_bye=had_full_point_bye,
                had_full_point_unplayed_round=had_full_point_unplayed_round,
                is_top_scorer=scores_by_name[username] == top_score,
                float_history=float_history_by_name[username],
            )
        )

    return tuple(snapshots)


def _materialize_pairings(
    *,
    tournament: Tournament,
    state: _DutchPairingState,
    backend_name: str,
    pairings_by_id: list[tuple[int, int | None]],
) -> list[tuple[User, User]]:
    """Convert backend pairing ids back into concrete waiting-player objects."""

    pairing: list[tuple[User, User]] = []
    paired_ids: set[int] = set()
    bye_ids: set[int] = set()

    for white_id, black_id in pairings_by_id:
        white_player = state.users_by_id.get(white_id)
        if white_player is None:
            raise RuntimeError(
                "%s returned unknown white player id %s in %s"
                % (backend_name, white_id, tournament.id)
            )

        if black_id is None:
            tournament._record_bye(white_player)  # type: ignore[attr-defined]
            bye_ids.add(white_id)
            continue

        black_player = state.users_by_id.get(black_id)
        if black_player is None:
            raise RuntimeError(
                "%s returned unknown black player id %s in %s"
                % (backend_name, black_id, tournament.id)
            )

        pairing.append((white_player, black_player))
        paired_ids.add(white_id)
        paired_ids.add(black_id)

    unresolved = state.waiting_ids.difference(paired_ids).difference(bye_ids)
    if unresolved:
        raise RuntimeError(
            "%s left waiting players unpaired in %s: %s"
            % (backend_name, tournament.id, sorted(unresolved))
        )

    return pairing


def _build_dutch_pairing_state(
    tournament: Tournament,
    waiting_players: list[User],
    completed_rounds: int,
) -> _DutchPairingState:
    """Build the py4swiss TRF state for the next Swiss pairing call."""

    all_names = sorted(
        {player.username for player in tournament.players}.union(tournament.players_by_name)
    )
    waiting_names = {user.username for user in waiting_players}

    seed_entries: list[tuple[int, str, PlayerData]] = []
    for username in all_names:
        player_data = tournament.player_data_by_name(username)
        if player_data is None:
            continue
        seed_entries.append((_seed_rating(player_data), username, player_data))

    seed_entries.sort(key=lambda item: (-item[0], item[1]))
    ids_by_name = {username: idx for idx, (_, username, _) in enumerate(seed_entries, start=1)}
    waiting_ids = {
        ids_by_name[player.username] for player in waiting_players if player.username in ids_by_name
    }

    users_by_id: dict[int, User] = {}
    for player in waiting_players:
        player_id = ids_by_name.get(player.username)
        if player_id is not None:
            users_by_id[player_id] = player

    rank_by_name = _build_rank_map(tournament, [username for _, username, _ in seed_entries])
    scoring = _build_scoring_system(tournament.variant)

    player_sections: list[Any] = []
    for _, username, player_data in seed_entries:
        player_sections.append(
            runtime.PlayerSection(
                code=runtime.PlayerCode.PLAYER,
                starting_number=ids_by_name[username],
                name=username,
                fide_rating=player_data.rating,
                points_times_ten=_score_points_times_ten(
                    tournament,
                    username,
                    player_data,
                    completed_rounds,
                ),
                rank=rank_by_name[username],
                results=_build_player_results(
                    tournament,
                    username,
                    player_data,
                    ids_by_name,
                    completed_rounds,
                ),
            )
        )

    x_section = runtime.XSection(
        number_of_rounds=max(tournament.rounds, completed_rounds + 1),
        zeroed_ids={ids_by_name[name] for name in ids_by_name if name not in waiting_names},
        scoring_point_system=scoring,
        configuration=runtime.XSectionConfiguration(first_round_color=True, by_rank=False),
        forbidden_pairs=_forbidden_pair_ids(tournament.forbidden_pairings, ids_by_name),
    )
    trf = runtime.ParsedTrf(player_sections=player_sections, x_section=x_section)
    trf.validate_contents()
    return _DutchPairingState(trf=trf, waiting_ids=waiting_ids, users_by_id=users_by_id)


__all__ = [
    "_DutchPairingState",
    "_build_dutch_pairing_state",
    "_build_swisspairing_float_history",
    "_build_swisspairing_snapshots",
    "_materialize_pairings",
]
