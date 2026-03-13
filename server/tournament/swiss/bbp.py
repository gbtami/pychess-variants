from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

from const import FLAG
from tournament.tournament import ByeGame, PairingUnavailable, Tournament

from .history import (
    _build_rank_map,
    _normalized_pairing_lines,
    _round_entries_by_number,
    _score_points_times_ten,
    _seed_rating,
)
from .state import _materialize_pairings

if TYPE_CHECKING:
    from tournament.tournament import PlayerData
    from user import User


log = logging.getLogger(__name__)

_BBP_EXECUTABLE_ENV = "BBP_PAIRINGS_EXECUTABLE"
_BBP_TIMEOUT_ENV = "BBP_PAIRINGS_TIMEOUT_SECONDS"
_DEFAULT_BBP_TIMEOUT_SECONDS = 30.0


@dataclass(slots=True)
class _BbpPairingState:
    trf_text: str
    waiting_ids: set[int]
    users_by_id: dict[int, User]


def _serialize_decimal(points_times_ten: int, padding: int = 0) -> str:
    return f"{points_times_ten // 10}.{points_times_ten % 10}".rjust(padding)


def _serialize_round_result(opponent_id: int, color: str, result: str) -> str:
    opponent = "0000" if opponent_id == 0 else str(opponent_id).rjust(4)
    return f"{opponent} {color} {result}"


def _serialize_results(results: list[str]) -> str:
    return "".join(f"  {result}" for result in results)


def _serialize_player_line(
    *,
    starting_number: int,
    name: str,
    fide_rating: int,
    points_times_ten: int,
    rank: int,
    results: list[str],
) -> str:
    # Field layout adapted from py4swiss's Apache-2.0 TRF serializer.
    parts = [
        "001".ljust(3),
        str(starting_number).rjust(4),
        "".rjust(1),
        "".rjust(3),
        name.ljust(33),
        str(fide_rating).rjust(4),
        "".ljust(3),
        "".rjust(11),
        "".ljust(10),
        _serialize_decimal(points_times_ten).rjust(4),
        str(rank).rjust(4),
        _serialize_results(results)[1:],
    ]
    string = " ".join(parts)
    return string[:10] + string[11:]


def _point_system_lines_for_variant(variant: str) -> list[str]:
    if variant == "janggi":
        raise RuntimeError("bbpPairings backend does not support Janggi Swiss scoring yet")

    return [
        "BBW  2.0",
        "BBD  1.0",
        "BBL  0.0",
        "BBZ  0.0",
        "BBF  0.0",
        "BBU  2.0",
    ]


def _bbp_timeout_seconds() -> float:
    raw = os.getenv(_BBP_TIMEOUT_ENV, "").strip()
    if raw == "":
        return _DEFAULT_BBP_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        log.warning(
            "Invalid %s=%s, falling back to %.1fs",
            _BBP_TIMEOUT_ENV,
            raw,
            _DEFAULT_BBP_TIMEOUT_SECONDS,
        )
        return _DEFAULT_BBP_TIMEOUT_SECONDS
    return max(1.0, value)


def _bbp_pairings_executable() -> Path | None:
    configured = os.getenv(_BBP_EXECUTABLE_ENV, "").strip()
    candidates: list[str] = []
    if configured:
        candidates.append(configured)
    candidates.extend(
        (
            str(Path.home() / "bbpPairings" / "bbpPairings.exe"),
            "bbpPairings.exe",
            "bbpPairings",
        )
    )

    for candidate in candidates:
        resolved = Path(candidate).expanduser()
        if resolved.is_file():
            return resolved
        found = shutil.which(candidate)
        if found:
            return Path(found)
    return None


def bbp_backend_unavailability_reason(tournament: Tournament) -> str | None:
    if tournament.variant == "janggi":
        return "bbpPairings backend does not support Janggi Swiss scoring"

    executable = _bbp_pairings_executable()
    if executable is None:
        return (
            "bbpPairings backend requires a bbpPairings executable; set "
            f"{_BBP_EXECUTABLE_ENV} or install bbpPairings in PATH"
        )

    return None


def bbp_backend_available(tournament: Tournament | None = None) -> bool:
    if tournament is None:
        return _bbp_pairings_executable() is not None
    return bbp_backend_unavailability_reason(tournament) is None


def _is_unplayed_forfeit(game: Any) -> bool:
    if getattr(game, "status", None) != FLAG:
        return False
    ply = getattr(game, "ply", None)
    if ply is None:
        board = getattr(game, "board", None)
        ply = getattr(board, "ply", None)
    return isinstance(ply, int) and ply < 2


def _serialize_game_result(
    *,
    game: Any,
    username: str,
    ids_by_name: dict[str, int],
) -> str:
    white_name = game.wplayer.username
    black_name = game.bplayer.username

    if username == white_name:
        opponent_name = black_name
        color = "w"
        won = game.result == "1-0"
        lost = game.result == "0-1"
    elif username == black_name:
        opponent_name = white_name
        color = "b"
        won = game.result == "0-1"
        lost = game.result == "1-0"
    else:
        raise RuntimeError("Swiss game history references a player outside the pairing record")

    opponent_id = ids_by_name.get(opponent_name)
    if opponent_id is None:
        raise RuntimeError(
            "Swiss game history references missing opponent %s for %s" % (opponent_name, username)
        )

    if _is_unplayed_forfeit(game):
        result = "+" if won else "-" if lost else "D"
    else:
        result = "1" if won else "0" if lost else "="

    return _serialize_round_result(opponent_id, color, result)


def _serialize_player_results(
    tournament: Tournament,
    username: str,
    player_data: PlayerData,
    ids_by_name: dict[str, int],
    completed_rounds: int,
) -> list[str]:
    results: list[str] = []
    round_entries = _round_entries_by_number(tournament, username, player_data)

    for round_no in range(1, completed_rounds + 1):
        round_entry = round_entries.get(round_no)
        if round_entry is None:
            results.append(_serialize_round_result(0, "-", "Z"))
            continue

        game, _point_entry = round_entry
        if isinstance(game, ByeGame):
            results.append(_serialize_round_result(0, "-", getattr(game, "token", "U")))
            continue

        results.append(
            _serialize_game_result(
                game=game,
                username=username,
                ids_by_name=ids_by_name,
            )
        )

    return results


def _serialize_absent_players_line(round_no: int, absent_ids: list[int]) -> str:
    return "240   %03d%s" % (
        round_no,
        "".join(f" {player_id:>4}" for player_id in absent_ids),
    )


def _serialize_forbidden_pair_lines(raw: str, ids_by_name: dict[str, int]) -> list[str]:
    lower_ids_by_name = {name.lower(): player_id for name, player_id in ids_by_name.items()}
    lines: list[str] = []

    for left_name, right_name in _normalized_pairing_lines(raw):
        if left_name == right_name or right_name == "1":
            continue
        left_id = lower_ids_by_name.get(left_name)
        right_id = lower_ids_by_name.get(right_name)
        if left_id is None or right_id is None or left_id == right_id:
            continue
        ordered = sorted((left_id, right_id))
        lines.append("XXP %s %s" % (ordered[0], ordered[1]))

    return lines


def _build_bbp_pairing_state(
    tournament: Tournament,
    waiting_players: list[User],
    completed_rounds: int,
) -> _BbpPairingState:
    _point_system_lines_for_variant(tournament.variant)

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
    users_by_id = {
        ids_by_name[player.username]: player
        for player in waiting_players
        if player.username in ids_by_name
    }
    rank_by_name = _build_rank_map(tournament, [username for _, username, _ in seed_entries])

    player_lines = []
    for _, username, player_data in seed_entries:
        player_lines.append(
            _serialize_player_line(
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
                results=_serialize_player_results(
                    tournament,
                    username,
                    player_data,
                    ids_by_name,
                    completed_rounds,
                ),
            )
        )

    lines = [f"012 {tournament.name}"]
    lines.extend(player_lines)
    lines.append(f"XXR {max(tournament.rounds, completed_rounds + 1)}")
    lines.extend(_point_system_lines_for_variant(tournament.variant))
    lines.append("XXC white1")
    lines.extend(_serialize_forbidden_pair_lines(tournament.forbidden_pairings, ids_by_name))

    absent_ids = sorted(
        player_id for username, player_id in ids_by_name.items() if username not in waiting_names
    )
    if absent_ids:
        lines.append(_serialize_absent_players_line(completed_rounds + 1, absent_ids))

    return _BbpPairingState(
        trf_text="\n".join(lines) + "\n",
        waiting_ids=waiting_ids,
        users_by_id=users_by_id,
    )


def build_bbp_trf_export_text(
    tournament: Tournament,
    waiting_players: list[User] | None = None,
) -> str:
    selected_waiting_players = waiting_players
    if selected_waiting_players is None:
        selected_waiting_players = tournament.waiting_players()

    completed_rounds = max(0, tournament.current_round - 1)
    state = _build_bbp_pairing_state(tournament, selected_waiting_players, completed_rounds)
    return state.trf_text


def _parse_bbp_output(stdout: str) -> list[tuple[int, int | None]]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("bbpPairings returned no pairing output")

    try:
        expected_pairs = int(lines[0])
    except ValueError as exc:
        raise RuntimeError(f"bbpPairings returned invalid pair count: {lines[0]!r}") from exc

    pair_lines = lines[1:]
    if len(pair_lines) != expected_pairs:
        raise RuntimeError(
            "bbpPairings returned %s pair lines, expected %s" % (len(pair_lines), expected_pairs)
        )

    pairings_by_id: list[tuple[int, int | None]] = []
    for line in pair_lines:
        parts = line.split()
        if len(parts) != 2:
            raise RuntimeError(f"bbpPairings returned invalid pair line: {line!r}")
        try:
            white_id = int(parts[0])
            black_id = int(parts[1])
        except ValueError as exc:
            raise RuntimeError(f"bbpPairings returned invalid player ids: {line!r}") from exc
        pairings_by_id.append((white_id, None if black_id == 0 else black_id))

    return pairings_by_id


async def create_bbp_pairing(
    tournament: Tournament,
    waiting_players: list[User],
    completed_rounds: int,
) -> list[tuple[User, User]]:
    reason = bbp_backend_unavailability_reason(tournament)
    if reason is not None:
        raise RuntimeError(reason)

    executable = _bbp_pairings_executable()
    assert executable is not None

    state = _build_bbp_pairing_state(tournament, waiting_players, completed_rounds)

    with tempfile.TemporaryDirectory(prefix="pychess-bbp-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        trf_path = temp_dir / "pairing.trf"
        trf_path.write_text(state.trf_text, encoding="utf-8")

        process = await asyncio.create_subprocess_exec(
            str(executable),
            "--dutch",
            str(trf_path),
            "-p",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=_bbp_timeout_seconds(),
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            raise PairingUnavailable(
                "bbpPairings timed out while generating a Dutch pairing"
            ) from None

    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

    if process.returncode == 1:
        message = stderr or "No valid pairing exists"
        raise PairingUnavailable(f"bbpPairings could not find a legal Dutch pairing: {message}")

    if process.returncode != 0:
        detail = stderr or stdout or f"exit code {process.returncode}"
        raise RuntimeError(f"bbpPairings failed to generate a Dutch pairing: {detail}")

    pairings_by_id = _parse_bbp_output(stdout)
    lookup_state = SimpleNamespace(waiting_ids=state.waiting_ids, users_by_id=state.users_by_id)
    return _materialize_pairings(
        tournament=tournament,
        state=cast(Any, lookup_state),
        backend_name="bbpPairings",
        pairings_by_id=pairings_by_id,
    )


__all__ = [
    "bbp_backend_available",
    "bbp_backend_unavailability_reason",
    "build_bbp_trf_export_text",
    "create_bbp_pairing",
]
