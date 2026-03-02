from __future__ import annotations
from dataclasses import dataclass
import logging
from typing import TYPE_CHECKING, Any

from const import SWISS
from tournament.tournament import ByeGame, SCORE_SHIFT, Tournament

try:
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

    PY4SWISS_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - exercised only when dependency is missing
    DutchEngine = None
    PairingError = RuntimeError
    ParsedTrf = None
    PlayerCode = None
    ColorToken = None
    ResultToken = None
    RoundResult = None
    ScoringPointSystem = None
    ScoringPointSystemCode = None
    PlayerSection = None
    XSection = None
    XSectionConfiguration = None
    PY4SWISS_IMPORT_ERROR = exc

DutchEngine: Any
PairingError: Any
ParsedTrf: Any
PlayerCode: Any
ColorToken: Any
ResultToken: Any
RoundResult: Any
ScoringPointSystem: Any
ScoringPointSystemCode: Any
PlayerSection: Any
XSection: Any
XSectionConfiguration: Any

if TYPE_CHECKING:
    from game import Game
    from tournament.tournament import GameData, PlayerData
    from user import User


log = logging.getLogger(__name__)


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


def _score_points_times_ten(
    tournament: Tournament, username: str, player_data: PlayerData, completed_rounds: int
) -> int:
    if completed_rounds <= 0:
        return 0

    leaderboard_points = tournament.leaderboard_score_by_username(username) // SCORE_SHIFT
    if leaderboard_points > 0:
        return leaderboard_points * 10

    # Fallback for repaired/partial states where leaderboard lookup is unavailable.
    total = 0
    for point in player_data.points:
        if point == "-":
            total += _bye_point_value(tournament.variant) * 10
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
    game_result: str, is_white: bool, variant: str, round_point: int | None
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
    win, draw, loss = _score_values_for_variant(variant)
    scoring = ScoringPointSystem()
    scoring.apply_code(ScoringPointSystemCode.WIN, win)
    scoring.apply_code(ScoringPointSystemCode.DRAW, draw)
    scoring.apply_code(ScoringPointSystemCode.LOSS, loss)

    # Swiss bye scoring (not RR): pairing-allocated/full-point bye == full win points.
    half_bye = draw if draw > 0 else (win // 2)
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


def _seed_rating(player_data: PlayerData) -> int:
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
    if isinstance(point, tuple) and isinstance(point[0], int):
        return point[0]
    return None


def _round_result_for_game(
    game: Game | GameData,
    username: str,
    ids_by_name: dict[str, int],
    variant: str,
    round_point: int | None,
):
    white_name = game.wplayer.username
    black_name = game.bplayer.username

    if username == white_name:
        opponent_name = black_name
        color = ColorToken.WHITE
        token = _as_finished_result_token(
            game.result, is_white=True, variant=variant, round_point=round_point
        )
    elif username == black_name:
        opponent_name = white_name
        color = ColorToken.BLACK
        token = _as_finished_result_token(
            game.result, is_white=False, variant=variant, round_point=round_point
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
    results: list[Any] = []

    for round_index in range(completed_rounds):
        point_entry = (
            player_data.points[round_index] if round_index < len(player_data.points) else None
        )
        point_value = _point_value(point_entry)

        if round_index >= len(player_data.games):
            bye_token = (
                ResultToken.PAIRING_ALLOCATED_BYE
                if point_entry == "-"
                else ResultToken.ZERO_POINT_BYE
            )
            results.append(
                RoundResult(
                    id=0,
                    color=ColorToken.BYE_OR_NOT_PAIRED,
                    result=bye_token,
                )
            )
            continue

        game = player_data.games[round_index]
        if isinstance(game, ByeGame) or point_entry == "-":
            results.append(
                RoundResult(
                    id=0,
                    color=ColorToken.BYE_OR_NOT_PAIRED,
                    result=ResultToken.PAIRING_ALLOCATED_BYE,
                )
            )
            continue

        round_result = _round_result_for_game(
            game,
            username,
            ids_by_name,
            tournament.variant,
            point_value,
        )
        if round_result is None:
            error_message = (
                "Unable to map Swiss game history to Dutch TRF for %s in tournament %s (game=%s, round=%s, result=%s)"
                % (username, tournament.id, game.id, round_index + 1, game.result)
            )
            raise RuntimeError(error_message)
        results.append(round_result)

    return results


@dataclass(slots=True)
class _DutchPairingState:
    trf: Any
    waiting_ids: set[int]
    users_by_id: dict[int, User]


def _build_dutch_pairing_state(
    tournament: Tournament, waiting_players: list[User], completed_rounds: int
) -> _DutchPairingState:
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
    )
    trf = ParsedTrf(player_sections=player_sections, x_section=x_section)
    trf.validate_contents()
    return _DutchPairingState(trf=trf, waiting_ids=waiting_ids, users_by_id=users_by_id)


class SwissTournament(Tournament):
    system = SWISS

    def _record_bye(self, player: User) -> None:
        player_data = self.player_data_by_name(player.username)
        if player_data is not None:
            player_data.games.append(ByeGame())
            player_data.points.append("-")
        self.bye_players.append(player)

    def _apply_bye_points(self, player: User) -> None:
        player_data = self.player_data_by_name(player.username)
        if player_data is None:
            return

        full_score = self.leaderboard_score_by_username(player.username)
        current_points = full_score // SCORE_SHIFT
        bye_points = _bye_point_value(self.variant)
        new_full_score = SCORE_SHIFT * (current_points + bye_points) + player_data.performance
        self.set_leaderboard_score_by_username(player.username, new_full_score, player=player)

    async def persist_byes(self) -> None:
        if not self.bye_players:
            return

        bye_players = self.bye_players
        self.bye_players = []
        for player in bye_players:
            self._apply_bye_points(player)
            await self.db_update_player(player, "BYE")

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        if len(waiting_players) == 0:
            return []
        if len(waiting_players) == 1:
            self._record_bye(waiting_players[0])
            return []

        if DutchEngine is None:
            raise RuntimeError(
                "Swiss (Dutch) pairing requires py4swiss, but import failed"
            ) from PY4SWISS_IMPORT_ERROR

        completed_rounds = max(0, self.current_round - 1)
        state = _build_dutch_pairing_state(self, waiting_players, completed_rounds)

        try:
            dutch_pairings = DutchEngine.generate_pairings(state.trf)
        except PairingError as exc:
            raise RuntimeError(f"py4swiss could not find a legal Dutch pairing: {exc}") from exc

        pairing: list[tuple[User, User]] = []
        paired_ids: set[int] = set()
        bye_ids: set[int] = set()

        for dutch_pairing in dutch_pairings:
            white_id = dutch_pairing.white
            black_id = dutch_pairing.black

            white_player = state.users_by_id.get(white_id)
            if white_player is None:
                raise RuntimeError(
                    "py4swiss returned unknown white player id %s in %s" % (white_id, self.id)
                )

            if black_id == 0:
                self._record_bye(white_player)
                bye_ids.add(white_id)
                continue

            black_player = state.users_by_id.get(black_id)
            if black_player is None:
                raise RuntimeError(
                    "py4swiss returned unknown black player id %s in %s" % (black_id, self.id)
                )

            pairing.append((white_player, black_player))
            paired_ids.add(white_id)
            paired_ids.add(black_id)

        unresolved = state.waiting_ids.difference(paired_ids).difference(bye_ids)
        if unresolved:
            raise RuntimeError(
                "py4swiss left waiting players unpaired in %s: %s" % (self.id, sorted(unresolved))
            )

        log.debug("Swiss Dutch pairing created %s games in %s", len(pairing), self.id)
        return pairing
