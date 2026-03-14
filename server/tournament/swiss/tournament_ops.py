from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import TYPE_CHECKING

from const import ABORTED
from fairy import BLACK, WHITE
from tournament.tournament import ByeGame, PairingUnavailable, SCORE_SHIFT

from .history import (
    _bye_point_value,
    _half_bye_point_value,
    _normalized_pairing_lines,
    _swiss_berger_tiebreak,
)

if TYPE_CHECKING:
    from game import Game
    from user import User


log = logging.getLogger(__name__)


async def _clear_consumed_manual_pairings(tournament) -> None:
    """Clear manual pairings after they were consumed for a round."""

    if not tournament._manual_pairings_used_for_round:
        return

    tournament.manual_pairings = ""
    if tournament.app_state.db is not None:
        await tournament.app_state.db.tournament.update_one(
            {"_id": tournament.id},
            {"$set": {"manualPairings": ""}},
        )


def _manual_pairing_entries(
    tournament,
    waiting_players: list[User],
) -> tuple[list[tuple[User, User]], list[User]]:
    """Parse manual pairing text into explicit pairings and manual byes."""

    if tournament.manual_pairings.strip() == "":
        return ([], [])

    waiting_by_name = {player.username.lower(): player for player in waiting_players}
    used_names: set[str] = set()
    pairing: list[tuple[User, User]] = []
    byes: list[User] = []

    for left_name, right_name in _normalized_pairing_lines(tournament.manual_pairings):
        if right_name == "1":
            bye_player = waiting_by_name.get(left_name)
            if bye_player is None or left_name in used_names:
                continue
            byes.append(bye_player)
            used_names.add(left_name)
            continue

        if left_name == right_name:
            continue

        white = waiting_by_name.get(left_name)
        black = waiting_by_name.get(right_name)
        if white is None or black is None:
            continue
        if left_name in used_names or right_name in used_names:
            continue

        pairing.append((white, black))
        used_names.add(left_name)
        used_names.add(right_name)

    return (pairing, byes)


def _consume_manual_pairings(
    tournament,
    waiting_players: list[User],
) -> tuple[list[tuple[User, User]], bool]:
    """Apply manual pairings once and mark the round as manually overridden."""

    tournament._manual_pairings_used_for_round = False
    tournament._last_manual_bye_count = 0

    pairing, byes = _manual_pairing_entries(tournament, waiting_players)
    if not pairing and not byes:
        return ([], False)

    for bye_player in byes:
        tournament._record_bye(bye_player)
    tournament._manual_pairings_used_for_round = True
    tournament._last_manual_bye_count = len(byes)
    return (pairing, True)


def _active_swiss_ban_until(tournament, user: User, now: datetime | None = None) -> datetime | None:
    """Return the player's still-active Swiss ban timestamp, if any."""

    if now is None:
        now = datetime.now(timezone.utc)
    banned_until = user.swiss_ban_until
    if banned_until is None or banned_until <= now:
        return None
    return banned_until


async def _clear_swiss_ban(tournament, user: User) -> None:
    """Remove an existing Swiss no-show ban from a player and the database."""

    if user.anon or user.bot:
        return

    user.swiss_ban_until = None
    user.swiss_ban_hours = 0
    if tournament.app_state.db is not None:
        await tournament.app_state.db.user.update_one(
            {"_id": user.username},
            {"$unset": {"swissBanUntil": "", "swissBanHours": ""}},
        )


async def _ban_swiss_no_show(tournament, user: User, now: datetime) -> None:
    """Apply the escalating Swiss no-show ban policy to a player."""

    if user.anon or user.bot:
        return

    previous_until = user.swiss_ban_until
    previous_hours = user.swiss_ban_hours
    if previous_until is None or previous_hours <= 0:
        hours = 24
    elif previous_until <= now:
        hours = previous_hours * 2
    else:
        hours = int(previous_hours * 1.5)

    hours = min(hours, 30 * 24)
    banned_until = now + timedelta(hours=hours)
    user.swiss_ban_until = banned_until
    user.swiss_ban_hours = hours

    if tournament.app_state.db is not None:
        await tournament.app_state.db.user.update_one(
            {"_id": user.username},
            {"$set": {"swissBanUntil": banned_until, "swissBanHours": hours}},
        )


def _player_who_did_not_move(_tournament, game: Game) -> User | None:
    """Detect which player lost without making a move in a finished game."""

    winner: User | None = None
    if game.result == "1-0":
        winner = game.wplayer
    elif game.result == "0-1":
        winner = game.bplayer

    if game.variant == "janggi":
        if game.bsetup:
            culprit = game.bplayer
        elif game.wsetup:
            culprit = game.wplayer
        else:
            culprit = None
        if culprit is not None and culprit != winner:
            return culprit

    try:
        start_color = WHITE if game.board.initial_fen.split()[1] == "w" else BLACK
    except IndexError:
        start_color = WHITE

    culprit: User | None
    if game.board.ply == 0:
        culprit = game.wplayer if start_color == WHITE else game.bplayer
    elif game.board.ply == 1:
        culprit = game.bplayer if start_color == WHITE else game.wplayer
    else:
        culprit = None

    if culprit == winner:
        return None
    return culprit


async def _update_swiss_no_show_bans(tournament, game: Game) -> None:
    """Update both players' Swiss ban state after a finished Swiss game."""

    if game.status == ABORTED:
        return

    culprit = tournament._player_who_did_not_move(game)
    now = datetime.now(timezone.utc)
    for player in (game.wplayer, game.bplayer):
        if player == culprit:
            await tournament._ban_swiss_no_show(player, now)
        else:
            await tournament._clear_swiss_ban(player)


def recalculate_berger_tiebreak(tournament) -> None:
    """Recompute Berger values and refresh packed leaderboard scores."""

    score_points_by_username = {
        player.username: full_score // SCORE_SHIFT
        for player, full_score in tournament.leaderboard.items()
    }

    for player_data in tournament.players.values():
        player_data.berger = _swiss_berger_tiebreak(
            tournament,
            player_data,
            score_points_by_username,
        )

    for leaderboard_player in list(tournament.leaderboard.keys()):
        player_data = tournament.player_data_by_name(leaderboard_player.username)
        if player_data is None:
            continue
        score_points = score_points_by_username.get(leaderboard_player.username, 0)
        tournament.leaderboard.update(
            {
                leaderboard_player: tournament.compose_leaderboard_score(
                    score_points,
                    player_data,
                )
            }
        )


def _record_bye(tournament, player: User) -> None:
    """Record an allocated bye in player history and the pending bye queue."""

    player_data = tournament.player_data_by_name(player.username)
    if player_data is not None:
        player_data.games.append(ByeGame(token="U", round_no=tournament.current_round))
        player_data.points.append("-")
    tournament.bye_players.append(player)


def _is_late_join_allowed(tournament) -> bool:
    # Lichess-like policy: allow new late entries while no more than half rounds were played.
    return tournament.current_round <= (tournament.rounds // 2)


def _late_join_half_point(tournament) -> int:
    return _half_bye_point_value(tournament.variant)


async def _initialize_late_entry_round_history(tournament, player: User) -> None:
    """Give a late joiner the synthetic H/Z round history used by Swiss pairing."""

    player_data = tournament.player_data_by_name(player.username)
    if player_data is None:
        return

    missed_rounds = tournament.current_round
    if missed_rounds <= 0:
        player_data.joined_round = 1
        return

    player_data.joined_round = missed_rounds + 1
    half_point = tournament._late_join_half_point()
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
        await tournament.db_insert_bye_pairing(player, round_no=round_no, bye_token=token)

    if bonus_awarded:
        current_points = tournament.leaderboard_score_by_username(player.username) // SCORE_SHIFT
        tournament.set_leaderboard_score_by_username(
            player.username,
            tournament.compose_leaderboard_score(current_points + half_point, player_data),
            player=player,
        )


async def pair_fixed_round(tournament, now: datetime) -> bool:
    """Create and persist the next round, or finish if no legal round exists."""

    waiting_players = tournament.waiting_players()
    manual_pairing, manual_byes = tournament._manual_pairing_entries(waiting_players)
    has_manual_pairings = bool(manual_pairing or manual_byes)
    if len(waiting_players) < 2 and not has_manual_pairings:
        await tournament.finish()
        log.info(
            "T_FINISHED: Swiss has fewer than 2 active players to pair in round %s",
            tournament.current_round,
        )
        return False

    await tournament.set_pairing_in_progress_round(tournament.current_round)

    try:
        pairing, games = await tournament.create_new_pairings(
            waiting_players,
            publish_pairings=False,
        )
    except PairingUnavailable as exc:
        await tournament.set_pairing_in_progress_round(None)
        await tournament.finish()
        log.info(
            "T_FINISHED: Swiss has no legal pairing in round %s (%s)",
            tournament.current_round,
            exc,
        )
        return False

    manual_byes_only_round = (
        tournament._manual_pairings_used_for_round and tournament._last_manual_bye_count > 0
    )
    if len(pairing) == 0 and not manual_byes_only_round:
        await tournament.set_pairing_in_progress_round(None)
        await tournament.finish()
        log.info(
            "T_FINISHED: Swiss produced no pairings in round %s with %s active players",
            tournament.current_round,
            len(waiting_players),
        )
        return False

    await tournament.save_current_round()
    await tournament._clear_consumed_manual_pairings()
    tournament.next_round_starts_at = None
    tournament.manual_next_round_pending = False
    await tournament.publish_pairings(games)
    await tournament.broadcast(tournament.live_status(now))
    return True


def _apply_bye_points(tournament, player: User) -> None:
    """Apply the configured full-point bye score to the player's leaderboard entry."""

    player_data = tournament.player_data_by_name(player.username)
    if player_data is None:
        return

    full_score = tournament.leaderboard_score_by_username(player.username)
    current_points = full_score // SCORE_SHIFT
    bye_points = _bye_point_value(tournament.variant)
    new_full_score = tournament.compose_leaderboard_score(current_points + bye_points, player_data)
    tournament.set_leaderboard_score_by_username(player.username, new_full_score, player=player)


async def persist_byes(tournament) -> None:
    """Persist queued byes to the database and recompute scoreboard state."""

    if not tournament.bye_players:
        return

    bye_players = tournament.bye_players
    tournament.bye_players = []
    for player in bye_players:
        tournament._apply_bye_points(player)
    tournament.recalculate_berger_tiebreak()
    for player in bye_players:
        await tournament.db_insert_bye_pairing(player)
        await tournament.db_update_player(player, "BYE")


async def persist_unpaired_round_entries(
    tournament,
    round_no: int,
    pairing: list[tuple[User, User]],
    bye_players: list[User],
) -> None:
    """Add synthetic Z entries for active players left out of the round snapshot."""

    paired_names = {player.username for pair in pairing for player in pair}
    paired_names.update(player.username for player in bye_players)

    for player in list(tournament.leaderboard):
        player_data = tournament.player_data_by_name(player.username)
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
        await tournament.db_insert_bye_pairing(player, round_no=round_no, bye_token="Z")
        await tournament.db_update_player(player, "GAME_END")


__all__ = [
    "_active_swiss_ban_until",
    "_apply_bye_points",
    "_ban_swiss_no_show",
    "_clear_consumed_manual_pairings",
    "_clear_swiss_ban",
    "_consume_manual_pairings",
    "_initialize_late_entry_round_history",
    "_is_late_join_allowed",
    "_late_join_half_point",
    "_manual_pairing_entries",
    "_player_who_did_not_move",
    "_record_bye",
    "_update_swiss_no_show_bans",
    "pair_fixed_round",
    "persist_byes",
    "persist_unpaired_round_entries",
    "recalculate_berger_tiebreak",
]
