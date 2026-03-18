from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from py4swiss.trf import ParsedTrf
from py4swiss.trf.codes import PlayerCode
from py4swiss.trf.sections import PlayerSection, XSection
from py4swiss.trf.sections.x_section import XSectionConfiguration
from tournament.tournament import Tournament
from .history import (
    _build_player_results,
    _build_rank_map,
    _build_scoring_system,
    _forbidden_pair_ids,
    _score_points_times_ten,
    _seed_rating,
)

if TYPE_CHECKING:
    from tournament.tournament import PlayerData
    from user import User


@dataclass(slots=True)
class _DutchPairingState:
    """TRF state plus waiting-player lookup used by the py4swiss backend."""

    trf: Any
    waiting_ids: set[int]
    users_by_id: dict[int, User]


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
            PlayerSection(
                code=PlayerCode.PLAYER,
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

    x_section = XSection(
        number_of_rounds=max(tournament.rounds, completed_rounds + 1),
        zeroed_ids={ids_by_name[name] for name in ids_by_name if name not in waiting_names},
        scoring_point_system=scoring,
        configuration=XSectionConfiguration(first_round_color=True, by_rank=False),
        forbidden_pairs=_forbidden_pair_ids(tournament.forbidden_pairings, ids_by_name),
    )
    trf = ParsedTrf(player_sections=player_sections, x_section=x_section)
    trf.validate_contents()
    return _DutchPairingState(trf=trf, waiting_ids=waiting_ids, users_by_id=users_by_id)


__all__ = [
    "_DutchPairingState",
    "_build_dutch_pairing_state",
    "_materialize_pairings",
]
