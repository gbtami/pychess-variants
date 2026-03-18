from __future__ import annotations

from typing import TYPE_CHECKING, Any

from py4swiss.trf.results import (
    ColorToken,
    ResultToken,
    RoundResult,
    ScoringPointSystem,
    ScoringPointSystemCode,
)
from tournament.tournament import ByeGame, SCORE_SHIFT, Tournament

if TYPE_CHECKING:
    from game import Game
    from tournament.tournament import GameData, PlayerData


def _parse_rating(raw: str | int | None, fallback: int) -> int:
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        try:
            return int(raw.rstrip("?"))
        except ValueError:
            return fallback
    return fallback


def _bye_point_value(variant: str) -> int:
    win, _, _ = _score_values_for_variant(variant)
    return win // 10


def _half_bye_point_value(variant: str) -> int:
    if variant == "janggi":
        # Janggi Swiss policy: late-join compensation uses 2 tournament points.
        return 2
    win, draw, _ = _score_values_for_variant(variant)
    return draw // 10 if draw > 0 else (win // 20)


def _half_bye_points_times_ten(variant: str) -> int:
    if variant == "janggi":
        # Keep Janggi half-bye inside the existing played-game point pool (0/2/4/7).
        return 20
    win, draw, _ = _score_values_for_variant(variant)
    return draw if draw > 0 else (win // 2)


def _unplayed_pairing_points_times_ten(token: str, variant: str) -> int:
    win, draw, _ = _score_values_for_variant(variant)
    if token in ("U", "F"):
        return win
    if token == "H":
        return _half_bye_points_times_ten(variant)
    return 0


def _score_points_times_ten(
    tournament: Tournament,
    username: str,
    player_data: PlayerData,
    completed_rounds: int,
) -> int:
    """Compute pairing points from round history instead of packed leaderboard totals."""

    if completed_rounds <= 0:
        return 0

    games_by_round: dict[int, tuple[Any, Any]] = {}
    for game_index, game in enumerate(player_data.games):
        round_no = getattr(game, "round", None)
        if not isinstance(round_no, int) or round_no <= 0:
            continue
        point_entry = (
            player_data.points[game_index] if game_index < len(player_data.points) else None
        )
        games_by_round[round_no] = (game, point_entry)

    # Pairing points should be computed from per-round outcomes (including U/H/F/Z tokens),
    # not from leaderboard totals, because awarded tournament points may intentionally differ.
    total = 0
    for round_no in range(1, completed_rounds + 1):
        round_entry = games_by_round.get(round_no)
        if round_entry is None:
            total += _unplayed_pairing_points_times_ten("Z", tournament.variant)
            continue

        game, point_entry = round_entry
        if isinstance(game, ByeGame):
            total += _unplayed_pairing_points_times_ten(
                getattr(game, "token", "U"), tournament.variant
            )
            continue

        if point_entry == "-":
            total += _unplayed_pairing_points_times_ten("U", tournament.variant)
            continue

        point_value = _point_value(point_entry)
        if point_value is not None:
            total += point_value * 10
            continue

    if total > 0:
        return total

    # Fallback for repaired/partial states where round history is not fully usable yet.
    leaderboard_points = tournament.leaderboard_score_by_username(username) // SCORE_SHIFT
    if leaderboard_points > 0:
        return leaderboard_points * 10

    for point in player_data.points:
        if point == "-":
            total += _unplayed_pairing_points_times_ten("U", tournament.variant)
            continue
        if isinstance(point, tuple):
            raw = point[0]
            if isinstance(raw, int):
                total += raw * 10
    return total


def _score_values_for_variant(variant: str) -> tuple[int, int, int]:
    # Swiss/RR scoring for non-janggi variants is 2/1/0 in this codebase.
    if variant == "janggi":
        return (70, 0, 0)
    return (20, 10, 0)


def _as_finished_result_token(
    game_result: str,
    is_white: bool,
    variant: str,
    round_point: int | None,
):
    # Janggi variant-end scoring is 4/2 (winner/loser) in Swiss, unlike normal 7/0.
    if variant == "janggi" and game_result in ("1-0", "0-1"):
        if round_point == 4:
            return ResultToken.WIN_NOT_RATED
        if round_point == 2:
            return ResultToken.LOSS_NOT_RATED

    if game_result == "1-0":
        return ResultToken.WIN if is_white else ResultToken.LOSS
    if game_result == "0-1":
        return ResultToken.LOSS if is_white else ResultToken.WIN
    if game_result == "1/2-1/2":
        return ResultToken.DRAW
    return None


def _build_scoring_system(variant: str):
    """Build the py4swiss scoring configuration for the given Swiss variant."""

    win, draw, loss = _score_values_for_variant(variant)
    scoring = ScoringPointSystem()
    scoring.apply_code(ScoringPointSystemCode.WIN, win)
    scoring.apply_code(ScoringPointSystemCode.DRAW, draw)
    scoring.apply_code(ScoringPointSystemCode.LOSS, loss)

    # Swiss bye scoring (not RR): pairing-allocated/full-point bye == full win points.
    half_bye = _half_bye_points_times_ten(variant)
    scoring.apply_code(ScoringPointSystemCode.ZERO_POINT_BYE, 0)
    scoring.apply_code(ScoringPointSystemCode.HALF_POINT_BYE, half_bye)
    scoring.apply_code(ScoringPointSystemCode.FULL_POINT_BYE, win)
    scoring.apply_code(ScoringPointSystemCode.PAIRING_ALLOCATED_BYE, win)

    if variant == "janggi":
        # Preserve Janggi Swiss base ratios from points_perfs_janggi(): variant-end win/loss = 4/2.
        scoring.score_dict[(ResultToken.WIN_NOT_RATED, ColorToken.WHITE)] = 40
        scoring.score_dict[(ResultToken.WIN_NOT_RATED, ColorToken.BLACK)] = 40
        scoring.score_dict[(ResultToken.LOSS_NOT_RATED, ColorToken.WHITE)] = 20
        scoring.score_dict[(ResultToken.LOSS_NOT_RATED, ColorToken.BLACK)] = 20

    return scoring


def _normalized_pairing_lines(raw: str) -> list[tuple[str, str]]:
    """Normalize manual pairing text into lowercase ``(left, right)`` pairs."""

    lines: list[tuple[str, str]] = []
    for raw_line in raw.splitlines():
        parts = [part.strip().lower() for part in raw_line.strip().split() if part.strip()]
        if len(parts) == 2:
            lines.append((parts[0], parts[1]))
    return lines


def _forbidden_pair_ids(raw: str, ids_by_name: dict[str, int]) -> set[tuple[int, int]]:
    """Translate forbidden manual pairings into TRF starting-number pairs."""

    forbidden_pairs: set[tuple[int, int]] = set()
    lower_ids_by_name = {name.lower(): player_id for name, player_id in ids_by_name.items()}
    for left_name, right_name in _normalized_pairing_lines(raw):
        if left_name == right_name or right_name == "1":
            continue
        left_id = lower_ids_by_name.get(left_name)
        right_id = lower_ids_by_name.get(right_name)
        if left_id is None or right_id is None or left_id == right_id:
            continue
        forbidden_pairs.add((min(left_id, right_id), max(left_id, right_id)))
    return forbidden_pairs


def _seed_rating(player_data: PlayerData) -> int:
    """Use the earliest observed opponent-facing rating as the player seed."""

    seed = player_data.rating
    earliest: tuple[object, int] | None = None

    for game in player_data.games:
        if isinstance(game, ByeGame):
            continue
        rating = (
            _parse_rating(game.wrating, seed)
            if game.wplayer.username == player_data.username
            else _parse_rating(game.brating, seed)
        )
        if earliest is None or game.date < earliest[0]:
            earliest = (game.date, rating)

    return earliest[1] if earliest is not None else seed


def _build_rank_map(tournament: Tournament, all_names: list[str]) -> dict[str, int]:
    rank_by_name = {
        player.username: rank for rank, player in enumerate(tournament.leaderboard, start=1)
    }
    next_rank = len(rank_by_name) + 1
    for username in all_names:
        if username not in rank_by_name:
            rank_by_name[username] = next_rank
            next_rank += 1
    return rank_by_name


def _point_value(point: Any) -> int | None:
    if isinstance(point, (tuple, list)) and len(point) > 0 and isinstance(point[0], int):
        return point[0]
    return None


def _swiss_round_point_value(tournament: Tournament, game: Any, point_entry: Any) -> int | None:
    point_value = _point_value(point_entry)
    if point_value is not None:
        return point_value

    if not isinstance(game, ByeGame):
        return None

    token = getattr(game, "token", "U")
    if token in ("U", "F"):
        return _bye_point_value(tournament.variant)
    if token == "H":
        return _half_bye_point_value(tournament.variant)
    return 0


def _swiss_berger_tiebreak(
    tournament: Tournament,
    player_data: PlayerData,
    score_points_by_username: dict[str, int],
) -> int:
    """Compute Berger from recorded round history, including real full-point byes."""

    round_entries: dict[int, tuple[Any, Any]] = {}
    for game_index, game in enumerate(player_data.games):
        round_no = getattr(game, "round", None)
        if not isinstance(round_no, int) or round_no <= 0:
            continue
        point_entry = (
            player_data.points[game_index] if game_index < len(player_data.points) else None
        )
        round_entries[round_no] = (game, point_entry)

    completed_rounds = max(
        getattr(tournament, "current_round", 0),
        max(round_entries.keys(), default=0),
    )
    if completed_rounds <= 0:
        return 0

    points_before_round: dict[int, int] = {}
    round_points: dict[int, int] = {}
    cumulative_points = 0
    for round_no in range(1, completed_rounds + 1):
        points_before_round[round_no] = cumulative_points
        round_entry = round_entries.get(round_no)
        if round_entry is None:
            continue
        round_point = _swiss_round_point_value(tournament, *round_entry)
        if round_point is None:
            continue
        round_points[round_no] = round_point
        cumulative_points += round_point

    half_point = _half_bye_point_value(tournament.variant)
    berger = 0
    for round_no, (game, _point_entry) in round_entries.items():
        round_point = round_points.get(round_no)
        if round_point is None or round_point <= 0:
            continue

        if isinstance(game, ByeGame):
            token = getattr(game, "token", "U")
            if token not in ("U", "F"):
                # Match lichess Swiss: virtual opponents are only used for actual byes,
                # not for synthetic late/absent entries shown in the score sheet.
                continue

            virtual_opponent_score = (
                points_before_round.get(round_no, 0)
                + round_point
                + half_point * max(0, completed_rounds - round_no)
            )
            berger += round_point * virtual_opponent_score
            continue

        white_name = game.wplayer.username
        black_name = game.bplayer.username
        if player_data.username == white_name:
            opponent_username = black_name
        elif player_data.username == black_name:
            opponent_username = white_name
        else:
            continue

        opponent_score = score_points_by_username.get(opponent_username, 0)
        berger += round_point * opponent_score

    return berger


def _round_result_for_unplayed_token(token: str):
    """Map an unplayed-round token to the corresponding py4swiss round result."""

    mapping = {
        "U": ResultToken.PAIRING_ALLOCATED_BYE,
        "H": ResultToken.HALF_POINT_BYE,
        "F": ResultToken.FULL_POINT_BYE,
        "Z": ResultToken.ZERO_POINT_BYE,
    }
    return RoundResult(
        id=0,
        color=ColorToken.BYE_OR_NOT_PAIRED,
        result=mapping.get(token, ResultToken.ZERO_POINT_BYE),
    )


def _round_result_for_game(
    game: Game | GameData,
    username: str,
    ids_by_name: dict[str, int],
    variant: str,
    round_point: int | None,
):
    """Convert a finished game into the player's TRF round-result entry."""

    white_name = game.wplayer.username
    black_name = game.bplayer.username

    if username == white_name:
        opponent_name = black_name
        color = ColorToken.WHITE
        token = _as_finished_result_token(
            game.result,
            is_white=True,
            variant=variant,
            round_point=round_point,
        )
    elif username == black_name:
        opponent_name = white_name
        color = ColorToken.BLACK
        token = _as_finished_result_token(
            game.result,
            is_white=False,
            variant=variant,
            round_point=round_point,
        )
    else:
        return None

    if token is None:
        return None

    opponent_id = ids_by_name.get(opponent_name)
    if opponent_id is None:
        return None

    return RoundResult(id=opponent_id, color=color, result=token)


def _build_player_results(
    tournament: Tournament,
    username: str,
    player_data: PlayerData,
    ids_by_name: dict[str, int],
    completed_rounds: int,
) -> list[Any]:
    """Build the player's TRF round results, filling missing rounds with Z entries."""

    results: list[Any] = []
    points = player_data.points
    games = player_data.games

    games_by_round: dict[int, tuple[Any, Any]] = {}
    for game_index, game in enumerate(games):
        round_no = getattr(game, "round", None)
        if not isinstance(round_no, int) or round_no <= 0:
            raise RuntimeError(
                "Swiss player history is missing round metadata for %s in tournament %s"
                % (username, tournament.id)
            )
        if round_no in games_by_round:
            raise RuntimeError(
                "Swiss player history has duplicate round metadata for %s in tournament %s (round=%s)"
                % (username, tournament.id, round_no)
            )
        point_entry = points[game_index] if game_index < len(points) else None
        games_by_round[round_no] = (game, point_entry)

    for round_index in range(completed_rounds):
        round_no = round_index + 1
        by_round_entry = games_by_round.get(round_no)
        if by_round_entry is None:
            results.append(_round_result_for_unplayed_token("Z"))
            continue

        game, game_point_entry = by_round_entry
        game_point_value = _point_value(game_point_entry)
        if isinstance(game, ByeGame):
            results.append(_round_result_for_unplayed_token(getattr(game, "token", "U")))
            continue
        round_result = _round_result_for_game(
            game,
            username,
            ids_by_name,
            tournament.variant,
            game_point_value,
        )
        if round_result is None:
            error_message = (
                "Unable to map Swiss game history to Dutch TRF for %s in tournament %s (game=%s, round=%s, result=%s)"
                % (username, tournament.id, game.id, round_no, game.result)
            )
            raise RuntimeError(error_message)
        results.append(round_result)

    return results


def _round_entries_by_number(
    tournament: Tournament,
    username: str,
    player_data: PlayerData,
) -> dict[int, tuple[Any, Any]]:
    """Index a player's history by round and validate the stored round metadata."""

    round_entries: dict[int, tuple[Any, Any]] = {}
    for game_index, game in enumerate(player_data.games):
        round_no = getattr(game, "round", None)
        if not isinstance(round_no, int) or round_no <= 0:
            raise RuntimeError(
                "Swiss player history is missing round metadata for %s in tournament %s"
                % (username, tournament.id)
            )
        if round_no in round_entries:
            raise RuntimeError(
                "Swiss player history has duplicate round metadata for %s in tournament %s (round=%s)"
                % (username, tournament.id, round_no)
            )
        point_entry = (
            player_data.points[game_index] if game_index < len(player_data.points) else None
        )
        round_entries[round_no] = (game, point_entry)
    return round_entries


def _build_forbidden_opponents_by_name(
    raw: str,
    waiting_names: set[str],
) -> dict[str, frozenset[str]]:
    """Restrict forbidden manual pairings to the currently waiting players."""

    lower_waiting_names = {name.lower(): name for name in waiting_names}
    forbidden_by_name = {name: set() for name in waiting_names}

    for left_name, right_name in _normalized_pairing_lines(raw):
        if left_name == right_name or right_name == "1":
            continue
        left_username = lower_waiting_names.get(left_name)
        right_username = lower_waiting_names.get(right_name)
        if left_username is None or right_username is None or left_username == right_username:
            continue
        forbidden_by_name[left_username].add(right_username)
        forbidden_by_name[right_username].add(left_username)

    return {username: frozenset(opponents) for username, opponents in forbidden_by_name.items()}


__all__ = [
    "_as_finished_result_token",
    "_build_forbidden_opponents_by_name",
    "_build_player_results",
    "_build_rank_map",
    "_build_scoring_system",
    "_bye_point_value",
    "_forbidden_pair_ids",
    "_half_bye_point_value",
    "_half_bye_points_times_ten",
    "_normalized_pairing_lines",
    "_parse_rating",
    "_point_value",
    "_round_entries_by_number",
    "_round_result_for_game",
    "_round_result_for_unplayed_token",
    "_score_points_times_ten",
    "_score_values_for_variant",
    "_seed_rating",
    "_swiss_berger_tiebreak",
    "_swiss_round_point_value",
    "_unplayed_pairing_points_times_ten",
]
