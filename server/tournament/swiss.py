from __future__ import annotations
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import tempfile
from typing import TYPE_CHECKING, Any

from const import SWISS, T_STARTED
from tournament.tournament import ByeGame, PairingUnavailable, SCORE_SHIFT, Tournament

try:
    from py4swiss.engines import DutchEngine
    from py4swiss.engines.common import PairingError
    from py4swiss.engines.common.float import Float as Py4SwissFloat
    from py4swiss.engines.dutch.player import get_player_infos_from_trf
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
    Py4SwissFloat = None
    get_player_infos_from_trf = None
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

try:
    from swisspairing import pair_round_dutch as swisspairing_pair_round_dutch
    from swisspairing.exceptions import PairingError as SwissPairingError
    from swisspairing.model import FloatKind as SwissFloatKind
    from swisspairing.model import PlayerState as SwissPlayerState

    SWISSPAIRING_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - exercised only when dependency is missing
    swisspairing_pair_round_dutch = None
    SwissPairingError = RuntimeError
    SwissFloatKind = None
    SwissPlayerState = None
    SWISSPAIRING_IMPORT_ERROR = exc

DutchEngine: Any
PairingError: Any
Py4SwissFloat: Any
get_player_infos_from_trf: Any
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
swisspairing_pair_round_dutch: Any
SwissPairingError: Any
SwissFloatKind: Any
SwissPlayerState: Any

if TYPE_CHECKING:
    from game import Game
    from tournament.tournament import GameData, PlayerData
    from user import User


log = logging.getLogger(__name__)

_SWISS_PAIRING_BACKEND_ENV = "SWISS_PAIRING_BACKEND"


def _swiss_pairing_backend() -> str:
    backend = os.getenv(_SWISS_PAIRING_BACKEND_ENV, "py4swiss").strip().lower()
    if backend in ("py4swiss", "swisspairing"):
        return backend
    log.warning(
        "Unknown %s=%s, falling back to py4swiss backend",
        _SWISS_PAIRING_BACKEND_ENV,
        backend,
    )
    return "py4swiss"


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
    win, draw, _ = _score_values_for_variant(variant)
    return draw // 10 if draw > 0 else (win // 20)


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
    if isinstance(point, (tuple, list)) and len(point) > 0 and isinstance(point[0], int):
        return point[0]
    return None


def _round_result_for_unplayed_token(token: str):
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


@dataclass(slots=True)
class _DutchPairingState:
    trf: Any
    waiting_ids: set[int]
    users_by_id: dict[int, User]


def _to_swiss_float_kind(float_value: Any):
    if float_value == Py4SwissFloat.UP:
        return SwissFloatKind.UP
    if float_value == Py4SwissFloat.DOWN:
        return SwissFloatKind.DOWN
    return SwissFloatKind.NONE


def _build_forbidden_map_from_trf(trf: Any) -> dict[int, set[int]]:
    forbidden_map: dict[int, set[int]] = {}
    for left_id, right_id in trf.x_section.forbidden_pairs:
        forbidden_map.setdefault(left_id, set()).add(right_id)
        forbidden_map.setdefault(right_id, set()).add(left_id)
    return forbidden_map


def _build_swisspairing_player_states_from_trf(trf: Any) -> tuple[Any, ...]:
    if (
        SwissPlayerState is None
        or SwissFloatKind is None
        or get_player_infos_from_trf is None
        or Py4SwissFloat is None
    ):
        raise RuntimeError(
            "Swiss pairing backend 'swisspairing' currently requires py4swiss state conversion helpers"
        ) from PY4SWISS_IMPORT_ERROR

    py4swiss_players = get_player_infos_from_trf(trf)
    top_ids = {player.id for player in py4swiss_players if player.top_scorer}
    forbidden_map = _build_forbidden_map_from_trf(trf)

    states: list[Any] = []
    for player in py4swiss_players:
        states.append(
            SwissPlayerState(
                player_id=str(player.id),
                pairing_no=player.number,
                score=player.points_with_acceleration,
                opponents=frozenset(str(opponent_id) for opponent_id in player.opponents),
                forbidden_opponents=frozenset(
                    str(opponent_id) for opponent_id in forbidden_map.get(player.id, set())
                ),
                color_history=tuple("white" if is_white else "black" for is_white in player.colors),
                unplayed_games=0,
                had_full_point_bye=player.bye_received,
                is_top_scorer=player.top_scorer,
                is_topscorer_or_opponent=player.top_scorer or bool(player.opponents & top_ids),
                float_history=(
                    _to_swiss_float_kind(player.float_2),
                    _to_swiss_float_kind(player.float_1),
                ),
            )
        )
    return tuple(states)


def _materialize_pairings(
    *,
    tournament: Tournament,
    state: _DutchPairingState,
    backend_name: str,
    pairings_by_id: list[tuple[int, int | None]],
) -> list[tuple[User, User]]:
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


def build_trf_export_text(tournament: Tournament, waiting_players: list[User] | None = None) -> str:
    """Export current Swiss tournament pairing state as TRF text.

    The exported state mirrors the same internal mapping used by Swiss pairing.
    """
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
    system = SWISS

    def _record_bye(self, player: User) -> None:
        player_data = self.player_data_by_name(player.username)
        if player_data is not None:
            player_data.games.append(ByeGame(token="U", round_no=self.current_round))
            player_data.points.append("-")
        self.bye_players.append(player)

    def _is_late_join_allowed(self) -> bool:
        # Lichess-like policy: allow new late entries while no more than half rounds were played.
        return self.current_round <= (self.rounds // 2)

    def _late_join_half_point(self) -> int:
        return _half_bye_point_value(self.variant)

    async def _initialize_late_entry_round_history(self, player: User) -> None:
        player_data = self.player_data_by_name(player.username)
        if player_data is None:
            return

        missed_rounds = self.current_round
        if missed_rounds <= 0:
            player_data.joined_round = 1
            return

        player_data.joined_round = missed_rounds + 1
        half_point = self._late_join_half_point()
        bonus_awarded = False

        for round_no in range(1, missed_rounds + 1):
            if not bonus_awarded and half_point > 0:
                token = "H"
                point = (half_point, 0)
                bonus_awarded = True
            else:
                token = "Z"
                point = (0, 0)

            player_data.games.append(ByeGame(token=token, round_no=round_no))
            player_data.points.append(point)
            await self.db_insert_bye_pairing(player, round_no=round_no, bye_token=token)

        if bonus_awarded:
            current_points = self.leaderboard_score_by_username(player.username) // SCORE_SHIFT
            self.set_leaderboard_score_by_username(
                player.username,
                self.compose_leaderboard_score(current_points + half_point, player_data),
                player=player,
            )

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

    def _apply_bye_points(self, player: User) -> None:
        player_data = self.player_data_by_name(player.username)
        if player_data is None:
            return

        full_score = self.leaderboard_score_by_username(player.username)
        current_points = full_score // SCORE_SHIFT
        bye_points = _bye_point_value(self.variant)
        new_full_score = self.compose_leaderboard_score(current_points + bye_points, player_data)
        self.set_leaderboard_score_by_username(player.username, new_full_score, player=player)

    async def persist_byes(self) -> None:
        if not self.bye_players:
            return

        bye_players = self.bye_players
        self.bye_players = []
        for player in bye_players:
            self._apply_bye_points(player)
        self.recalculate_berger_tiebreak()
        for player in bye_players:
            await self.db_insert_bye_pairing(player)
            await self.db_update_player(player, "BYE")

    async def persist_unpaired_round_entries(
        self,
        round_no: int,
        pairing: list[tuple[User, User]],
        bye_players: list[User],
    ) -> None:
        paired_names = {player.username for pair in pairing for player in pair}
        paired_names.update(player.username for player in bye_players)

        for player in list(self.leaderboard):
            player_data = self.player_data_by_name(player.username)
            if player_data is None:
                continue
            if player_data.withdrawn:
                continue
            if player_data.joined_round > round_no:
                continue
            if player.username in paired_names:
                continue

            # Avoid duplicate synthetic entries when recovering/replaying round state.
            if any(getattr(game, "round", None) == round_no for game in player_data.games):
                continue

            player_data.games.append(ByeGame(token="Z", round_no=round_no))
            player_data.points.append((0, 0))
            await self.db_insert_bye_pairing(player, round_no=round_no, bye_token="Z")
            await self.db_update_player(player, "GAME_END")

    def create_pairing(self, waiting_players: list[User]) -> list[tuple[User, User]]:
        if len(waiting_players) == 0:
            return []
        if len(waiting_players) == 1:
            self._record_bye(waiting_players[0])
            return []

        if ParsedTrf is None:
            raise RuntimeError(
                "Swiss pairing state mapping requires py4swiss, but import failed"
            ) from PY4SWISS_IMPORT_ERROR

        backend = _swiss_pairing_backend()
        completed_rounds = max(0, self.current_round - 1)
        state = _build_dutch_pairing_state(self, waiting_players, completed_rounds)

        if backend == "py4swiss":
            if DutchEngine is None:
                raise RuntimeError(
                    "Swiss (Dutch) pairing backend 'py4swiss' requires py4swiss, but import failed"
                ) from PY4SWISS_IMPORT_ERROR

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

        if swisspairing_pair_round_dutch is None:
            raise RuntimeError(
                "Swiss (Dutch) pairing backend 'swisspairing' requires swisspairing, but import failed"
            ) from SWISSPAIRING_IMPORT_ERROR

        states = _build_swisspairing_player_states_from_trf(state.trf)

        try:
            swisspairing_result = swisspairing_pair_round_dutch(states)
        except SwissPairingError as exc:
            raise PairingUnavailable(
                f"swisspairing could not find a legal Dutch pairing: {exc}"
            ) from exc

        pairings_by_id: list[tuple[int, int | None]] = []
        for pairing_result in swisspairing_result.pairings:
            white_id = int(pairing_result.white_id)
            black_id = None if pairing_result.black_id is None else int(pairing_result.black_id)
            pairings_by_id.append((white_id, black_id))

        pairing = _materialize_pairings(
            tournament=self,
            state=state,
            backend_name="swisspairing",
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
